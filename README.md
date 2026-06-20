# SMS Marketing CRM

A compliant two-way SMS CRM and SMS marketing SaaS MVP for US/UK businesses using Node.js, React, SQLite, and Vonage SMS.

The app supports:

- JWT authentication
- Contacts and consent tracking
- OpenPhone / Google Voice style manual SMS dialer
- Two-way inbox
- Mock SMS mode for local development
- Real Vonage sending when credentials are configured
- STOP/unsubscribe handling
- Delivery status webhook simulation
- Campaign drafts, previews, and mock queueing
- Sender number management
- Dashboard, reports, settings, and compliance pages

## Project Structure

```text
server/      Express API, SQLite database, Vonage/mock SMS logic
client-app/  React SaaS frontend
AUDIT.md     Audit findings and rebuild plan
TESTING.md   Automated and manual test steps
```

The old partial `client/` app has been removed. Use `client-app/`.

## Backend Setup

```powershell
Set-Location "D:\SMS Marketing App\server"
npm install
Copy-Item .env.example .env
npm run dev
```

Required local env:

```text
PORT=5000
JWT_SECRET=replace_with_a_long_secret
```

Optional Vonage env:

```text
VONAGE_API_KEY=your_vonage_api_key
VONAGE_API_SECRET=your_vonage_api_secret
VONAGE_SENDER_NUMBER=+15551234567
```

When Vonage credentials are missing, the backend automatically uses mock SMS mode and still saves messages as `sent_mock`.

## Frontend Setup

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm install
npm start
```

Open:

```text
http://localhost:3000
```

If port 3000 is busy:

```powershell
$env:PORT=3001
npm start
```

## Useful Commands

Backend smoke test:

```powershell
Set-Location "D:\SMS Marketing App\server"
npm run smoke
```

Frontend build:

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npm run build
```

Frontend browser smoke test:

```powershell
Set-Location "D:\SMS Marketing App\client-app"
npx playwright install chromium
npm run test:e2e
```

## Webhooks

Vonage inbound webhook:

```text
POST /webhooks/vonage/inbound
```

Vonage delivery status webhook:

```text
POST /webhooks/vonage/status
```

For local webhook testing, expose the backend with ngrok:

```powershell
ngrok http 5000
```

## Compliance Notes

- Send only to opted-in contacts.
- Manual SMS and campaign sends block suppressed/unsubscribed contacts.
- STOP/UNSUBSCRIBE/REMOVE/CANCEL/END/QUIT/NO replies update the contact and suppression list.
- US business messaging may require 10DLC registration.
- UK sender IDs may require approval depending on use case.
