import { createHmac, timingSafeEqual } from 'node:crypto';

export function validWebhookSignature(body: Buffer, signature: unknown, appSecret: string): boolean {
  if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', appSecret).update(body).digest();
  const actual = Buffer.from(signature.substring(7), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
