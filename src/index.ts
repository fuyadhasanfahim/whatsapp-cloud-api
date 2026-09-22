import express from 'express';
import { loadAssets } from './assets';
import { config } from './config';
import { JsonDb } from './db';
import { validWebhookSignature } from './security';
import { extractIncoming } from './webhook';
import { createWorker } from './worker';

async function main(): Promise<void> {
  const steps = await loadAssets(config.assetsPath);
  const db = new JsonDb(config.dbPath);
  await db.init();
  const pumpQueue = createWorker(db, config, steps);
  console.log(`Loaded ${steps.length} welcome steps from Assets/`);

  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.verifyToken) {
      return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    }
    return res.sendStatus(403);
  });
  app.post('/webhook', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !validWebhookSignature(req.body, req.header('x-hub-signature-256'), config.appSecret)) {
      res.sendStatus(403); return;
    }
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString('utf8')); }
    catch { res.sendStatus(400); return; }
    const messages = extractIncoming(payload, config.wabaId, config.phoneNumberId);
    try {
      const added = await db.acceptIncoming(messages); // Save ID before returning 200 to Meta.
      res.sendStatus(200);
      if (added) void pumpQueue();
    } catch (error) {
      console.error('Could not persist recipient; request Meta retry:', error);
      res.sendStatus(503);
    }
  });

  const server = app.listen(config.port, () => console.log(`Listening on :${config.port}. Webhook: /webhook`));
  // Queued contacts may remain if server stopped between saving webhook and running the worker.
  void pumpQueue();
  const interval = setInterval(() => { void pumpQueue(); }, 2_000);
  const stop = () => {
    clearInterval(interval);
    server.close();
    // Current request can be cut off by the hosting platform. On next boot, it becomes needs_review.
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

main().catch(error => { console.error('Cannot start:', error); process.exitCode = 1; });
