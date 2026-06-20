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

The smoke test verifies:

1. Health endpoint
2. Register user
3. Login
4. `/api/auth/me`
5. Create contact
6. Create sender number
7. Send mock manual SMS
8. Fetch conversations
9. Simulate inbound webhook reply
10. Simulate STOP webhook
11. Confirm contact becomes unsubscribed
12. Create campaign
13. Preview campaign
14. Dashboard report

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

## Manual UAT Steps

1. Open `http://localhost:3000`.
2. Register a new account.
3. Open Dashboard and confirm KPI cards load.
4. Open Contacts and add an opted-in US contact.
5. Open Numbers and add a default sender number.
6. Open Manual SMS, select the contact, type a message, and send.
7. Confirm mock-mode success appears if Vonage credentials are missing.
8. Open Inbox and confirm the conversation appears.
9. Use the inbound webhook endpoint to send `STOP`.
10. Confirm the contact is marked unsubscribed and Manual SMS blocks further sends.
11. Create a campaign and preview recipients.
12. Open Settings and confirm Vonage status shows mock/configured correctly.
13. Open Compliance and review opt-out keyword checklist.
