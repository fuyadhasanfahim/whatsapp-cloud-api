import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetStep } from './assets';

export type WhatsAppCredentials = { apiVersion: string; phoneNumberId: string; accessToken: string };

async function resultJson(response: Response): Promise<any> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = body as { error?: { code?: number; message?: string } };
    throw new Error(`Meta HTTP ${response.status}, code ${parsed?.error?.code ?? 'unknown'}: ${parsed?.error?.message ?? 'Unknown API error'}`);
  }
  return body;
}

/** Local media MUST be uploaded to Meta first; no public media URLs are required. */
async function uploadFile(credentials: WhatsAppCredentials, step: Extract<AssetStep, { file: string }>): Promise<string> {
  const bytes = await readFile(step.file);
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('file', new Blob([new Uint8Array(bytes)], { type: step.mime }), path.basename(step.file));
  const response = await fetch(`https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${credentials.accessToken}` }, body: form, signal: AbortSignal.timeout(60_000),
  });
  const payload = await resultJson(response);
  if (typeof payload?.id !== 'string' || !payload.id) throw new Error('Media upload returned no ID');
  return payload.id;
}

/** No HTTP retries: we prioritize never sending the same message twice. */
export async function sendStep(credentials: WhatsAppCredentials, to: string, step: AssetStep): Promise<string> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  let body: object;
  if (step.kind === 'text') {
    body = { ...base, type: 'text', text: { body: step.body, preview_url: step.previewUrl } };
  } else {
    const mediaId = await uploadFile(credentials, step);
    const media = { id: mediaId, ...(step.kind === 'audio' && step.voice ? { voice: true } : {}) };
    body = { ...base, type: step.kind, [step.kind]: media };
  }
  const response = await fetch(`https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const payload = await resultJson(response);
  const messageId = payload?.messages?.[0]?.id;
  if (typeof messageId !== 'string' || !messageId) throw new Error('Message request returned no ID; send outcome uncertain');
  return messageId; // API accepted. NOT a delivered/read confirmation.
}
