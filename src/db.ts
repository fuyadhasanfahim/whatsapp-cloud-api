import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from './webhook';

export type RecipientState = 'queued' | 'processing' | 'completed' | 'needs_review';
export type StepRecord = { index: number; label: string; state: 'sending' | 'accepted' | 'uncertain'; messageId?: string; note?: string };
export type Recipient = {
  state: RecipientState;
  firstMessageId: string;
  firstSeenAt: string;
  updatedAt: string;
  steps: StepRecord[];
  note?: string;
};
export type DbJson = { version: 1; recipients: Record<string, Recipient> };

/** Single Node.js process ONLY. JSON writes are serialized and atomically renamed. */
export class JsonDb {
  private data!: DbJson;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}

  async init(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeFile(this.file, '{"version":1,"recipients":{}}\n', { flag: 'wx', mode: 0o600 });
      text = await readFile(this.file, 'utf8');
    }
    const parsed: unknown = JSON.parse(text); // Corrupt JSON => fail closed. NEVER reset users.
    if (!parsed || typeof parsed !== 'object' || (parsed as DbJson).version !== 1 ||
        !(parsed as DbJson).recipients || Array.isArray((parsed as DbJson).recipients) ||
        typeof (parsed as DbJson).recipients !== 'object') throw new Error('Invalid db.json schema; restore a backup.');
    this.data = parsed as DbJson;
    // Any interrupted send might already have been accepted by Meta. Do not resend automatically.
    if (Object.values(this.data.recipients).some(entry => entry.state === 'processing')) await this.update(db => {
      for (const entry of Object.values(db.recipients)) {
        if (entry.state === 'processing') {
          entry.state = 'needs_review';
          entry.note = 'Server stopped while processing; do not auto-resend.';
          entry.updatedAt = new Date().toISOString();
        }
      }
    });
  }

  private async update<T>(change: (draft: DbJson) => T): Promise<T> {
    const operation = this.tail.then(async () => {
      const draft = structuredClone(this.data);
      const result = change(draft);
      const temp = path.join(path.dirname(this.file), `.${path.basename(this.file)}.${randomUUID()}.tmp`);
      // Rename avoids half-written JSON on process termination. Use persistent local disk.
      await writeFile(temp, JSON.stringify(draft, null, 2) + '\n', { mode: 0o600 });
      await rename(temp, this.file);
      this.data = draft;
      return result;
    });
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async acceptIncoming(messages: IncomingMessage[]): Promise<number> {
    if (!messages.length) return 0;
    return this.update(db => {
      let added = 0;
      for (const message of messages) {
        const key = message.customerWaId;
        if (Object.hasOwn(db.recipients, key)) continue;
        const now = new Date().toISOString();
        db.recipients[key] = { state: 'queued', firstMessageId: message.messageId, firstSeenAt: now, updatedAt: now, steps: [] };
        added++;
      }
      return added;
    });
  }

  async claimNext(): Promise<string | undefined> {
    await this.tail;
    if (!Object.values(this.data.recipients).some(entry => entry.state === 'queued')) return undefined;
    return this.update(db => {
      const key = Object.keys(db.recipients).find(id => db.recipients[id].state === 'queued');
      if (key) { db.recipients[key].state = 'processing'; db.recipients[key].updatedAt = new Date().toISOString(); }
      return key;
    });
  }

  async recordAttempt(id: string, index: number, label: string): Promise<void> {
    await this.update(db => {
      const entry = db.recipients[id];
      if (!entry || entry.state !== 'processing' || entry.steps.length !== index) throw new Error(`Invalid step attempt ${id}/${index}`);
      entry.steps.push({ index, label, state: 'sending' });
      entry.updatedAt = new Date().toISOString();
    });
  }

  async markAccepted(id: string, index: number, messageId: string): Promise<void> {
    await this.update(db => {
      const entry = db.recipients[id];
      const step = entry?.steps[index];
      if (!entry || entry.state !== 'processing' || step?.state !== 'sending') throw new Error('Unexpected acceptance state');
      step.state = 'accepted'; step.messageId = messageId; entry.updatedAt = new Date().toISOString();
    });
  }

  async needsReview(id: string, note: string): Promise<void> {
    await this.update(db => {
      const entry = db.recipients[id];
      if (!entry) throw new Error('Unknown recipient');
      entry.state = 'needs_review'; entry.note = note.slice(0, 500); entry.updatedAt = new Date().toISOString();
      const current = entry.steps.at(-1);
      if (current?.state === 'sending') { current.state = 'uncertain'; current.note = entry.note; }
    });
  }

  async markCompleted(id: string, count: number): Promise<void> {
    await this.update(db => {
      const entry = db.recipients[id];
      if (!entry || entry.state !== 'processing' || entry.steps.length !== count || entry.steps.some(step => step.state !== 'accepted')) {
        throw new Error('Cannot complete missing or uncertain welcome steps');
      }
      entry.state = 'completed'; entry.updatedAt = new Date().toISOString();
    });
  }

  // Only for testing / local inspection; do not expose as a public HTTP route.
  async snapshot(): Promise<DbJson> { await this.tail; return structuredClone(this.data); }
}
