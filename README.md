# WhatsApp Coexistence: once-only welcome (TypeScript + Express)

**No SQL, MongoDB, Redis, Prisma, Docker, AI, or bot ON/OFF.** All customer IDs are stored in one local file (`db.json`), all message content is read from `Assets/`. This project implements the **automation backend**, not Meta's Coexistence onboarding. Your existing Business App number must already be connected to Cloud API using Coexistence. See Meta documentation: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

## 1. Structure

```text
whatsapp-coexistence-json-express/
├── .env.example          <- copy to .env and fill in credentials
├── db.json               <- remembers each customer WhatsApp ID permanently; BACK THIS UP
├── package.json
├── tsconfig.json
├── Assets/
│   ├── text.txt          <- introduction (text message #1)
│   ├── link.txt          <- ONE full HTTPS URL (text message #2)
│   ├── Texts/            <- optional extra .txt messages, after link
│   │   └── .gitkeep
│   ├── Images/           <- one.jpg, two.jpg, three.jpg, four.jpg ...
│   │   └── .gitkeep
│   ├── Videos/           <- one.mp4, two.mp4, three.mp4 ...
│   │   └── .gitkeep
│   └── Audios/           <- one.ogg, two.ogg ... or MP3/M4A
│       └── .gitkeep
└── src/
    ├── index.ts         <- webhook + Express server
    ├── config.ts        <- reads .env
    ├── assets.ts        <- scans local media/text files in order
    ├── db.ts            <- db.json write/read + once-only protection
    ├── whatsapp.ts      <- local media upload + send messages via Cloud API
    ├── worker.ts        <- sequentially sends the one-time package
    ├── webhook.ts       <- filters incoming live customer messages
    ├── security.ts      <- checks Meta webhook signature
    └── logic.test.ts    <- local tests; no live Meta API required
```

`Assets` is the only message-content directory. **The ZIP contains empty media folders**: replace `.gitkeep` with YOUR actual images/videos/audios; `.gitkeep` will be ignored. Intro/link samples are placeholders that you MUST edit. You may put any count of files in the media folders; empty folder = skip that media type. Only accepted extensions are sent; unrelated files are ignored. `Texts/` is optional for extra text messages.

Sequence: `text.txt` → `link.txt` → `Texts/*.txt` → `Images/*` → `Videos/*` → `Audios/*`. Files named `one`, `two`, `three` ... `twenty` or `1`, `2`, ... sort numerically; other names sort alphabetically. **Restart the server after changing files** so the text/order snapshot reloads. Do not modify media files during an active send.

## 2. Requirements

- Node.js 20+ and npm. No database server or Docker needed.
- A WhatsApp Business **Coexistence-onboarded** phone number on the official Meta Cloud API, with proper permissions/token and messaging access.
- An externally reachable HTTPS address, e.g. `https://your-domain.com/webhook`; localhost alone cannot receive Meta webhooks. Use an HTTPS tunnel for local testing if needed.
- A **single** running Node.js instance, on a persistent writable disk. Do **not** run PM2 cluster mode, multiple containers, serverless replicas, or an ephemeral filesystem with this JSON-based design. It uses a single-process write queue and atomic file rename, **not cross-process locking**.

## 3. Configure .env

```sh
cp .env.example .env
```

Open `.env` and replace the six placeholders. `PORT` defaults to 3000. Meta values:

| Variable | Meaning |
|---|---|
| `META_APP_SECRET` | Meta Developer app settings > Basic > App Secret. Used to verify webhook HMAC. |
| `WHATSAPP_VERIFY_TOKEN` | Your own long random secret; configure the same value on Meta webhook page. |
| `WHATSAPP_ACCESS_TOKEN` | Valid authorized Cloud API access token, preferably production system-user token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta API's **phone number ID**, NOT the digits of your actual mobile number. |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID for this number. |
| `WHATSAPP_API_VERSION` | Currently supported Graph API version for your app, e.g. `v25.0`; update as needed. |

`db.json` and all assets are local files; **no database URL, media URLs, OpenAI key, admin phone, or toggle setting** is needed. Never disclose `.env` or commit it.

## 4. Put your message files in Assets/

1. Edit `Assets/text.txt` with your full intro.
2. Edit `Assets/link.txt` with exactly one `https://...` URL.
3. Add four images if you want four, e.g. `Assets/Images/one.jpg`, `two.jpg`, `three.png`, `four.jpg`. Supported: JPG/JPEG/PNG; each max **5 MB**.
4. Add two or more videos if desired, e.g. `Assets/Videos/one.mp4`, `two.mp4`. Supported MP4/3GP; each max **16 MB**. MP4 must use H.264 video and AAC audio (or no audio).
5. Add audio/voice messages under `Assets/Audios/`, e.g. `one.ogg`, `two.ogg`. **Voice notes:** `.ogg` must contain **Opus audio** (prefer mono); code sets `voice: true`. Simply renaming an `.mp3` to `.ogg` does NOT convert it. `.mp3`, `.m4a`, `.aac`, `.amr` also work, but are ordinary audio attachments. Each max **16 MB**. `.obb` is not a recognized WhatsApp audio format.
6. Optional additional text: `Assets/Texts/one.txt`, `two.txt` etc.

Local media is uploaded with `POST /{phone-number-ID}/media` as multipart form-data, then sent using the returned media ID. You do **not** need to host images/videos/audio on a CDN. See Meta's official API collection: https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3

## 5. Run

```sh
npm install
npm run dev
```

On deployment:

```sh
npm run build
npm start
```

Check: `http://localhost:3000/health` -> `{"ok":true}`. Webhook URL: `https://YOUR-PUBLIC-DOMAIN/webhook`.

On your Meta App webhook settings:

- Callback URL = `https://YOUR-PUBLIC-DOMAIN/webhook`
- Verify token = the exact `WHATSAPP_VERIFY_TOKEN` in `.env`
- Subscribe to the `messages` field and subscribe the app to your WABA (as required by Meta).
- Set up your existing WhatsApp Business App number through Coexistence onboarding **first**. This project does not log in to the WhatsApp app or create a Coexistence connection.

## 6. How `db.json` works (once-only)

A first **live** incoming message (text, photo, voice, etc.) is validated using Meta's signed webhook; `history`, `smb_message_echoes`, and delivery-only events are ignored. **Before responding 200 to Meta**, the customer `wa_id` is saved to `db.json` (keyed by WhatsApp customer ID). Duplicate webhooks and later messages find the existing ID and DO NOT start the automation again. The worker sends the loaded steps **sequentially** and logs each Graph API message ID.

Example after one successful test (illustration, NOT an actual result):

```json
{
  "version": 1,
  "recipients": {
    "8801700000000": {
      "state": "completed",
      "firstMessageId": "wamid.example",
      "firstSeenAt": "2026-09-22T10:00:00.000Z",
      "updatedAt": "2026-09-22T10:00:01.000Z",
      "steps": [
        { "index": 0, "label": "text.txt", "state": "accepted", "messageId": "wamid.outbound-example" }
      ]
    }
  }
}
```

`queued` = ID durably saved, not started. `processing` = currently running. `completed` = **all send requests accepted by Meta**, not proof of delivery to user's phone. `needs_review` = request failed, became uncertain, or process stopped mid-send; do NOT auto-retry and risk duplicates. On restart, `queued` jobs can run; interrupted `processing` entries become `needs_review`, never automatically resent. Every step is marked `sending` in JSON **before** calling the API. On API response, marked `accepted` with message ID, or `uncertain` on error. If upload fails before any send, package remains needs_review; there is intentionally no automatic retry. If user sends another inbound message, no repeat regardless of these states.

**Meaning of "once"**: with this one app instance and intact `db.json`, each ID gets **at most one send attempt per step**. API requests can time out after Meta accepts; to avoid sending duplicates, we do not replay uncertain attempts. Consequently, some customers may receive a **partial** package. There is no strict guarantee that every customer will receive the *entire* package exactly once or in the displayed delivery order. WhatsApp limits and service-window/template rules apply; messages initiated by the customer's first contact are typically inside the 24-hour customer service window if dispatched promptly. No approved templates are implemented here.

**Important:** A new empty `db.json` cannot know about customers handled by an old database or WhatsApp Business App. Preserve and back up `db.json` on stable local storage. For existing customers, prepopulate `recipients` with their IDs before starting; maintain the schema, e.g. entry `{"state":"completed","firstMessageId":"imported","firstSeenAt":"...","updatedAt":"...","steps":[]}`. Do not delete individual entries if you want once-in-a-lifetime behavior. Manual inspection is fine, but never expose this private file as a public URL.

## 7. Safety / troubleshooting

- Only run **one process**. Multiple independent processes can overwrite `db.json` and defeat deduplication.
- The file is written with temp + rename. A corrupt or invalid JSON file causes startup to **fail**, rather than resetting the send history. Set up backups, filesystem permissions and reliable disk storage. Cross-host durability and power-loss durability are not guaranteed.
- Webhook HTTP POST authenticates `X-Hub-Signature-256` using your Meta App Secret. An invalid signature returns 403; a disk write error returns 503, so Meta can retry the webhook. There is **no public endpoint to clear db.json**.
- If media exceeds supported limits, startup fails. If format extension does not match the internal codec, Meta may reject it, setting `needs_review`.
- Empty media folders are allowed but a warning is shown. If you accidentally start without media, any customer who contacts you gets only intro/link and will be marked as completed. Add all assets **before** enabling the webhook.
- `db.json` is private customer data. Back it up securely, restrict access, and follow your applicable consent/privacy requirements.
- API charges may apply under Meta's pricing. Coexistence must already be eligible/enabled for your number. If this is a production-scale or multi-instance service, replace this file design with a proper transactional datastore.

## 8. Tests

```sh
npm test
```

Tests use a fake WhatsApp sender and temporary JSON files; they do NOT call Meta or verify live delivery.
