# Testing

## Automated Backend Smoke Test

Start the backend first:

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run dev
```

In another terminal:

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run smoke
```

The smoke test verifies mock mode only and refuses to run against live SMS unless `SMOKE_ALLOW_LIVE=true` is set intentionally. It checks:

1. Health endpoint
2. Admin login
3. Normal user login/registration
4. Sender number creation
5. Mock outbound send
6. Conversation creation
7. Inbound Vonage webhook simulation
8. STOP webhook simulation
9. Unsubscribe/suppression blocks future sends
10. Normal user cannot access admin provider settings
11. Admin can access masked provider status
12. Status webhook updates message delivery status

## Frontend Build Test

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm run build
```

## Frontend Browser Smoke Test

Start backend:

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run dev
```

Start frontend:

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm start
```

Run Playwright:

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npx playwright install chromium
npm run test:e2e
```

## Mock Mode Manual Test

1. Open `http://localhost:3000`.
2. Run `npm run seed` in `server` and login with `admin@ftsolutions.local` / `password123`, or register a new account.
3. Confirm the app opens directly to Messages.
4. Confirm conversations and message bubbles appear.
5. Open Contacts and add an opted-in US contact.
6. Open Numbers and add a default sender number.
7. Open Dialpad / New Text, select the contact, type a message, and send.
8. Confirm mock-mode success appears if `VONAGE_MOCK_MODE=true` or Vonage credentials are missing.
9. Open Messages and confirm the conversation appears with status `sent_mock`.

## Live Vonage Mode Manual Test

1. Rotate any exposed Vonage secrets before testing live.
2. In `server/.env`, set `VONAGE_MOCK_MODE=false`, `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_SIGNATURE_SECRET`, `VONAGE_DEFAULT_FROM`, and `PUBLIC_BACKEND_URL`.
3. Start the backend and frontend.
4. Login as admin.
5. Open Admin Console -> Providers.
6. Confirm Vonage shows live mode and configured status.
7. Enter one approved test recipient and send exactly one live test SMS.
8. Confirm the response shows `mode: live` and a provider message ID when Vonage accepts it.
9. Open Messages and confirm the conversation appears.

## Inbound Webhook Test With ngrok

1. Run the backend on port 5000.
2. Run `ngrok http 5000`.
3. Set Vonage inbound webhook to `https://your-ngrok-url.ngrok-free.app/webhooks/vonage/inbound`.
4. Send an SMS from a phone to a SignalMint sender number assigned to a user.
5. Confirm the message appears inbound in Messages and unread count increments.
6. Send `STOP`.
7. Confirm that contact is marked unsubscribed and future sends to that phone are blocked for that user.

## Signed Webhook Behavior

1. With `VONAGE_SIGNATURE_SECRET` set, send a webhook request without `Authorization: Bearer <jwt>`.
2. Confirm the backend returns `401`.
3. Send a webhook request with an HS256 JWT signed using `VONAGE_SIGNATURE_SECRET`.
4. Confirm the backend accepts the webhook and records it in `webhook_logs`.
5. In development only, remove `VONAGE_SIGNATURE_SECRET` and confirm webhooks are allowed with a warning.
6. In production, missing signature secret should reject with `401`.

## Status Callback Test

1. Send a mock or live outbound message and note its provider message ID.
2. POST to `/webhooks/vonage/status` with that ID and status `delivered`.
3. Refresh Messages.
4. Confirm the message status updates to `delivered`.
