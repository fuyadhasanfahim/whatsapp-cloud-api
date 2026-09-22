export type IncomingMessage = {
  phoneNumberId: string;
  customerWaId: string;
  messageId: string;
};
export type DeliveryUpdate = { id: string; status: string };

// Only live inbound messages. Do NOT trigger on history, echoes or status notifications.
export function extractIncoming(body: unknown, expectedWabaId: string, expectedPhoneId: string): IncomingMessage[] {
  const output: IncomingMessage[] = [];
  if (!body || typeof body !== 'object') return output;
  const payload = body as Record<string, any>;
  if (payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return output;

  for (const entry of payload.entry) {
    if (String(entry?.id) !== expectedWabaId || !Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== 'messages') continue;
      const value = change.value;
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? '');
      if (phoneNumberId !== expectedPhoneId || !Array.isArray(value?.messages)) continue;
      for (const message of value.messages) {
        const from = message?.from;
        const id = message?.id;
        // Allow any actual customer content, including images, audio and unsupported media;
        // ignore reactions, deleted messages, protocol/system events and notifications.
        if (typeof from !== 'string' || !/^\d{7,15}$/.test(from)) continue;
        if (typeof id !== 'string' || !id.startsWith('wamid.')) continue;
        if (typeof message.type !== 'string' || ['reaction', 'system', 'unsupported', 'unknown', 'request_welcome'].includes(message.type)) continue;
        output.push({ phoneNumberId, customerWaId: from, messageId: id });
      }
    }
  }
  return output;
}

export function extractStatuses(body: unknown, expectedWabaId: string, expectedPhoneId: string): DeliveryUpdate[] {
  const output: DeliveryUpdate[] = [];
  const payload = body as any;
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return output;
  for (const entry of payload.entry) {
    if (String(entry?.id) !== expectedWabaId || !Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== 'messages' || String(change?.value?.metadata?.phone_number_id ?? '') !== expectedPhoneId) continue;
      for (const status of (Array.isArray(change?.value?.statuses) ? change.value.statuses : [])) {
        if (typeof status?.id === 'string' && ['sent', 'delivered', 'read', 'failed'].includes(status.status)) {
          output.push({ id: status.id, status: status.status });
        }
      }
    }
  }
  return output;
}
