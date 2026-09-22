import type { AssetStep } from './assets';
import { JsonDb } from './db';
import { sendStep, type WhatsAppCredentials } from './whatsapp';

export function createWorker(db: JsonDb, credentials: WhatsAppCredentials, steps: AssetStep[], send = sendStep) {
  let running = false;
  return async function pumpQueue(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (true) {
        const customerId = await db.claimNext();
        if (!customerId) break;
        let stopped = false;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          try {
            // Persist attempt BEFORE outbound API call: never replay an uncertain send.
            await db.recordAttempt(customerId, i, step.label);
            const messageId = await send(credentials, customerId, step);
            await db.markAccepted(customerId, i, messageId);
            console.log(`Meta accepted ${step.label} for customer ending ${customerId.slice(-4)}`);
          } catch (error) {
            const note = error instanceof Error ? error.message : String(error);
            console.error(`Welcome stopped for customer ending ${customerId.slice(-4)}: ${note}`);
            try { await db.needsReview(customerId, note); } catch (fileError) { console.error('db.json write failed; stop server:', fileError); throw fileError; }
            stopped = true;
            break;
          }
        }
        if (!stopped) await db.markCompleted(customerId, steps.length);
      }
    } catch (error) {
      console.error('Queue stopped. Review db.json before restarting:', error);
      // Fail closed if local filesystem cannot persist the once-only marker.
      process.exitCode = 1;
    } finally { running = false; }
  };
}
