# SignalMint eSIM Agent (Android)

Minimal Android app that pairs with SignalMint and sends/receives SMS for a per-user eSIM.

## Requirements

- Android phone with the eSIM installed (scan the carrier QR once in Settings → SIMs)
- Android 8+ recommended
- `SEND_SMS` and `RECEIVE_SMS` permissions (grant at runtime)

## Build

1. Open this folder in Android Studio (Giraffe+).
2. Sync Gradle, then **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Install the APK on the phone that hosts the eSIM.

Or from CLI (SDK installed):

```bash
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Pairing

1. In SignalMint → **My numbers** → Connect eSIM (QR/LPA + phone number).
2. Install the eSIM on the phone from the same QR.
3. Click **Pairing code** in the web UI.
4. In the agent app, enter:
   - Server base URL (example: `https://your-api.example.com` — no trailing path)
   - The 6-digit pairing code
5. Tap **Pair & start**. The agent polls `/api/esim-agent/jobs` and posts inbound SMS to `/api/esim-agent/inbound`.

## Manual test

1. In SignalMint dialer, send an SMS from the eSIM number to your personal phone.
2. Reply from your personal phone — the message should appear in Inbox.
