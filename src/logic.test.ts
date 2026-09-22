import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadAssets, orderFiles } from './assets';
import { JsonDb } from './db';
import { validWebhookSignature } from './security';
import { extractIncoming } from './webhook';
import { createWorker } from './worker';

const waba = '11111', phone = '22222';
function envelope(field: string, value: unknown, entryId = waba): unknown {
  return { object: 'whatsapp_business_account', entry: [{ id: entryId, changes: [{ field, value: { metadata: { phone_number_id: phone }, ...value as object } }] }] };
}
const incoming = (id: string, messageId = 'wamid.abc') => ({ phoneNumberId: phone, customerWaId: id, messageId });
const credentials = { apiVersion: 'v25.0', phoneNumberId: phone, accessToken: 'test-only' };

async function tempFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wa-json-test-'));
  for (const folder of ['Images', 'Videos', 'Audios', 'Texts']) await mkdir(path.join(dir, 'Assets', folder), { recursive: true });
  await writeFile(path.join(dir, 'Assets', 'text.txt'), 'Hello there');
  await writeFile(path.join(dir, 'Assets', 'link.txt'), 'https://example.com');
  return dir;
}

test('secure webhook signature and ignore echoes/statuses/history', () => {
  const body = Buffer.from('{"a":1}');
  const signature = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(validWebhookSignature(body, signature, 'secret'), true);
  assert.equal(validWebhookSignature(Buffer.from('{"a":2}'), signature, 'secret'), false);
  assert.equal(extractIncoming(envelope('messages', { messages: [{ from: '8801700000000', id: 'wamid.abc', type: 'image' }] }), waba, phone).length, 1);
  assert.equal(extractIncoming(envelope('history', { messages: [{ from: '8801700000000', id: 'wamid.abc', type: 'text' }] }), waba, phone).length, 0);
  assert.equal(extractIncoming(envelope('smb_message_echoes', { message_echoes: [] }), waba, phone).length, 0);
  assert.equal(extractIncoming(envelope('messages', { statuses: [{ id: 'wamid.abc' }] }), waba, phone).length, 0);
  assert.equal(extractIncoming(envelope('messages', { messages: [{ from: '8801700000000', id: 'wamid.abc', type: 'text' }] }, 'wrong'), waba, phone).length, 0);
});

test('assets are read from disk in explicit numeric/spoken order', async () => {
  const dir = await tempFixture();
  try {
    assert.deepEqual(orderFiles(['ten.mp4', 'two.mp4', 'one.mp4', '3.mp4']), ['one.mp4', 'two.mp4', '3.mp4', 'ten.mp4']);
    await writeFile(path.join(dir, 'Assets', 'Images', 'two.png'), Buffer.from('fake'));
    await writeFile(path.join(dir, 'Assets', 'Images', 'one.jpg'), Buffer.from('fake'));
    await writeFile(path.join(dir, 'Assets', 'Videos', 'one.mp4'), Buffer.from('fake'));
    await writeFile(path.join(dir, 'Assets', 'Audios', 'one.ogg'), Buffer.from('fake'));
    await writeFile(path.join(dir, 'Assets', 'Texts', 'one.txt'), 'Extra welcome');
    const steps = await loadAssets(path.join(dir, 'Assets'));
    assert.deepEqual(steps.map(s => s.label), [
      'text.txt', 'link.txt', 'Texts/one.txt', 'Images/one.jpg', 'Images/two.png', 'Videos/one.mp4', 'Audios/one.ogg',
    ]);
    assert.equal(steps.at(-1)?.kind, 'audio');
    const audio = steps.at(-1);
    if (audio?.kind === 'audio') assert.equal(audio.voice, true);
    else throw new Error('Expected audio last');
  } finally { await rm(dir, { force: true, recursive: true }); }
});

test('duplicate and simultaneous webhooks create ONE recipient and ONE package; persists after restart', async () => {
  const dir = await tempFixture();
  const file = path.join(dir, 'db.json');
  try {
    const db = new JsonDb(file);
    await db.init();
    const results = await Promise.all([db.acceptIncoming([incoming('8801700000000')]), db.acceptIncoming([incoming('8801700000000', 'wamid.def')])]);
    assert.equal(results.reduce((a,b) => a+b, 0), 1);
    const sent: string[] = [];
    const steps = await loadAssets(path.join(dir, 'Assets'));
    const worker = createWorker(db, credentials, steps, async (_creds, id, step) => {
      sent.push(`${id}/${step.label}`); return `wamid.${sent.length}`;
    });
    await Promise.all([worker(), worker()]);
    assert.deepEqual(sent, ['8801700000000/text.txt', '8801700000000/link.txt']);
    const before = await db.snapshot();
    assert.equal(before.recipients['8801700000000'].state, 'completed');
    assert.equal(before.recipients['8801700000000'].steps.length, 2);
    const dbRestarted = new JsonDb(file);
    await dbRestarted.init();
    assert.equal(await dbRestarted.acceptIncoming([incoming('8801700000000', 'wamid.new')]), 0);
    await createWorker(dbRestarted, credentials, steps, async () => { throw new Error('should never resend'); })();
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).recipients['8801700000000'].steps.map((s: { state: string }) => s.state), ['accepted', 'accepted']);
  } finally { await rm(dir, { force: true, recursive: true }); }
});

test('partial failure and crash never auto replay an uncertain message', async () => {
  const dir = await tempFixture();
  try {
    const file = path.join(dir, 'db.json');
    const db = new JsonDb(file); await db.init();
    await db.acceptIncoming([incoming('8801700000001')]);
    const steps = await loadAssets(path.join(dir, 'Assets'));
    let attempts = 0;
    await createWorker(db, credentials, steps, async () => { attempts++; throw new Error('network timeout'); })();
    assert.equal(attempts, 1);
    assert.equal((await db.snapshot()).recipients['8801700000001'].state, 'needs_review');
    assert.equal((await db.snapshot()).recipients['8801700000001'].steps[0].state, 'uncertain');
    await db.acceptIncoming([incoming('8801700000002')]);
    assert.equal(await db.claimNext(), '8801700000002');
    await db.recordAttempt('8801700000002', 0, 'text.txt');
    const restarted = new JsonDb(file); await restarted.init();
    assert.equal((await restarted.snapshot()).recipients['8801700000002'].state, 'needs_review');
    assert.equal(await restarted.claimNext(), undefined);
    await restarted.acceptIncoming([incoming('8801700000001'), incoming('8801700000002')]);
    assert.equal(await restarted.claimNext(), undefined);
  } finally { await rm(dir, { force: true, recursive: true }); }
});

test('local .ogg is uploaded then sent using a voice media ID (mocked Meta API)', async () => {
  const { sendStep } = await import('./whatsapp');
  const dir = await tempFixture();
  const previousFetch = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  try {
    const file = path.join(dir, 'Assets', 'Audios', 'one.ogg');
    await writeFile(file, Buffer.from('example mock media'));
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      if (String(url).endsWith('/media')) {
        const form = init?.body;
        if (!(form instanceof FormData)) throw new Error('Expected multipart upload');
        assert.equal(form.get('messaging_product'), 'whatsapp');
        assert.ok(form.get('file') instanceof File);
        return new Response(JSON.stringify({ id: 'media123' }), { status: 200 });
      }
      assert.ok(String(url).endsWith('/messages'));
      assert.deepEqual(JSON.parse(String(init?.body)), {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: '8801700000000',
        type: 'audio', audio: { id: 'media123', voice: true },
      });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.outbound' }] }), { status: 200 });
    };
    const id = await sendStep(credentials, '8801700000000', { kind: 'audio', label: 'one.ogg', file, mime: 'audio/ogg; codecs=opus', voice: true });
    assert.equal(id, 'wamid.outbound');
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = previousFetch; await rm(dir, { force: true, recursive: true }); }
});
