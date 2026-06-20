# SMS Marketing & Two-Way Messaging App Plan

**Project Name:** Compliant SMS CRM / SMS Marketing Dashboard  
**Prepared for:** Muhammad Afzal  
**Main Provider:** Vonage API  
**Target Countries:** United States and United Kingdom  
**Main Goal:** Build a web app where users can send SMS manually, send campaigns to opt-in contacts, receive replies, track delivery, and manage unsubscribes.

---

## 1. Project Summary

This app will be a **manual + campaign-based SMS dashboard**.

It will allow users to:

- Log in to a web dashboard.
- Add or import contacts.
- Send one-to-one SMS manually using a dialpad-style screen.
- Create SMS campaigns for selected contact lists.
- Send messages through Vonage API.
- Receive customer replies inside the app inbox.
- Track delivery status.
- Automatically handle STOP/unsubscribe replies.
- View campaign analytics and estimated cost.

The app should **not** be built as a SIM-farm, spam sender, random number blaster, or carrier-limit bypass system. It should be built as a professional, compliant SMS CRM.

---

## 2. Important Legal and Compliance Principle

For US/UK marketing SMS, the app should only send to contacts who have given permission.

The app must include:

- Opt-in/consent tracking.
- Unsubscribe handling.
- STOP keyword detection.
- Suppression list.
- Message history.
- Delivery status logs.
- Country-based rules.
- Clear opt-out text in marketing messages.

Example opt-out text:

```text
Reply STOP to opt out.
```

For manual one-to-one messages, the app should still protect against sending to unsubscribed numbers.

---

## 3. App Modes

The app should support two major sending modes:

---

### 3.1 Manual Dialpad SMS Mode

This is for sending a message to one number manually.

User flow:

```text
User opens Manual SMS page
↓
User selects sender number
↓
User enters recipient phone number
↓
User writes message
↓
System validates number and message
↓
User clicks Send
↓
Backend sends SMS through Vonage
↓
Message is saved in conversation history
↓
If recipient replies, reply appears in inbox
```

Manual SMS page should include:

- Sender number dropdown.
- Country selector.
- Recipient number input.
- Contact search box.
- Message text box.
- Character counter.
- SMS segment counter.
- Estimated cost.
- Send button.
- Recent conversation panel.
- Delivery status display.
- Warning if number is unsubscribed.
- Warning if number format is invalid.

Example UI fields:

```text
From: +1XXXXXXXXXX
To: +15551234567
Message: Hi John, this is ABC Services. Are you available for a quick update?
[Send SMS]
```

Manual sending should be used for:

- Customer support.
- Follow-ups.
- Lead replies.
- Appointment reminders.
- One-to-one communication.

Manual sending should not bypass unsubscribe rules.

---

### 3.2 Campaign Sending Mode

This is for sending one message to many contacts.

User flow:

```text
User creates campaign
↓
User selects contact list
↓
User writes message
↓
System checks consent and unsubscribed contacts
↓
User previews cost and recipients
↓
User clicks Send
↓
Messages are added to queue
↓
Queue sends at safe controlled rate
↓
Delivery and replies update dashboard
```

Campaign features:

- Create campaign.
- Choose contact group.
- Use variables like `{{name}}`.
- Preview personalized messages.
- Send now.
- Schedule later.
- Pause campaign.
- Resume campaign.
- Cancel campaign.
- View campaign stats.

Example campaign message:

```text
Hi {{name}}, this is ABC Services. We have a special offer this week. Reply YES for details. Reply STOP to opt out.
```

---

## 4. Core Modules

The app should include these main modules:

1. Authentication
2. Dashboard
3. Contacts
4. Manual SMS / Dialpad
5. Campaigns
6. Inbox
7. Delivery Tracking
8. Unsubscribe Management
9. Reports
10. Numbers Management
11. Provider Settings
12. Billing / Cost Estimation
13. Admin Settings
14. Logs and Monitoring

---

## 5. User Roles

Suggested user roles:

| Role | Permissions |
|---|---|
| Owner | Full access to everything |
| Admin | Manage contacts, campaigns, numbers, settings |
| Manager | Create/send campaigns, view reports |
| Agent | Use inbox and manual SMS |
| Viewer | View reports only |

---

## 6. Authentication Features

Required features:

- Register/login.
- Password hashing.
- JWT or session authentication.
- Forgot password.
- Email verification.
- Role-based access.
- Team/member management.
- Account status: active, suspended, trial, paid.

---

## 7. Contact Management

Contacts page should allow:

- Add contact manually.
- Import CSV/Excel.
- Export contacts.
- Edit contact.
- Delete contact.
- Search contacts.
- Filter by country, tag, status.
- Create lists/groups.
- Duplicate detection.
- Phone number validation.
- Consent tracking.
- Unsubscribe status.

Contact fields:

```text
id
workspace_id
name
phone
country
email
tags
consent_status
consent_source
consent_date
is_unsubscribed
unsubscribed_at
created_at
updated_at
```

Consent statuses:

```text
opted_in
not_opted_in
unsubscribed
unknown
```

---

## 8. Manual Dialpad Page Details

This page is important because the user specifically wants manual sending.

### Features

- Input recipient phone number.
- Search existing contact.
- Select sender number.
- Write message.
- Show SMS segment count.
- Show estimated cost.
- Send button.
- Save sent message to database.
- Show conversation history.
- Receive replies in same thread.
- Mark conversation as open/closed.
- Add notes to contact.
- Assign conversation to agent.

### Safety checks before sending

Before sending a manual SMS, the backend should check:

```text
Is sender number active?
Is recipient number valid?
Is country supported?
Is contact unsubscribed?
Is message empty?
Is account balance enough?
Is rate limit exceeded?
```

If the contact is unsubscribed:

```text
Block sending and show:
"This number is unsubscribed. You cannot send marketing or manual messages unless the contact opts in again."
```

### Manual SMS API flow

```text
POST /api/manual-sms/send
```

Request example:

```json
{
  "to": "+15551234567",
  "from": "+15550001111",
  "message": "Hi John, this is ABC Services. Are you available?"
}
```

Backend steps:

```text
1. Validate user permission.
2. Validate sender number.
3. Validate recipient number.
4. Check suppression/unsubscribe list.
5. Calculate SMS segments.
6. Send SMS using Vonage.
7. Save message record.
8. Return status to frontend.
```

---

## 9. Inbox / Two-Way Messaging

The app must have an inbox where replies are shown.

Inbox features:

- Conversation list.
- Search by phone/name.
- Read/unread status.
- Reply from dashboard.
- Assign conversation to agent.
- Add internal notes.
- Show sent/delivered/failed messages.
- Show contact information.
- Detect STOP/unsubscribe.
- Filter conversations by campaign.

Inbox layout:

```text
Left side: conversation list
Right side: selected chat
Bottom: reply box
```

Conversation example:

```text
You: Hi John, we have an offer today. Reply YES for details.
John: YES
You: Great, here are the details...
```

---

## 10. Vonage Integration

Vonage will provide:

- SMS sending API.
- Virtual numbers.
- Inbound SMS webhook.
- Delivery receipt webhook.
- US/UK number support.
- 10DLC support for US business SMS.

Required Vonage setup:

```text
Vonage account
API key
API secret
Virtual number
Inbound SMS webhook URL
Delivery receipt webhook URL
US 10DLC setup if sending US business/marketing SMS
UK sender setup if sending UK SMS
```

---

## 11. Vonage Throughput and Limits

Important current Vonage-related limits:

- Vonage SMS API keys have a default throughput restriction of **30 API requests per second**.
- Some sending routes or number types can be restricted lower, sometimes around **1 SMS per second**.
- Vonage Messages API sandbox has a limit of **1 message per second** and **100 messages per month**.
- US 10DLC throughput depends on campaign type, carrier, brand approval, and account configuration.
- AT&T 10DLC limits can be measured per minute, and messages may be queued if the limit is exceeded.
- Inbound SMS and delivery receipts require publicly accessible webhook URLs.

Sources:

- Vonage Throughput Limit: https://api.support.vonage.com/hc/en-us/articles/203993598-What-is-the-Throughput-Limit-for-Outbound-SMS
- Vonage 10DLC Throughput: https://api.support.vonage.com/hc/en-us/articles/4406782736532-10-DLC-Throughput-Limits
- Vonage Inbound SMS Webhooks: https://developer.vonage.com/en/messaging/sms/guides/inbound-sms
- Vonage Webhooks Requirement: https://developer.vonage.com/en/messaging/sms/code-snippets/before-you-begin
- Vonage Messages API Sandbox Limit: https://api.support.vonage.com/hc/en-us/articles/11679887237276-What-is-the-Messages-API-sandbox-rate-limit

---

## 12. Recommended Sending Rate Settings

The app should not send everything instantly. It should use a queue and controlled rate limits.

Recommended settings:

| Environment | Suggested Speed |
|---|---|
| Local testing | 1 SMS/sec |
| Sandbox testing | 1 SMS/sec |
| New production account | 1-5 SMS/sec |
| Registered US 10DLC normal campaign | 5-30 SMS/sec depending on approval |
| Higher approved throughput | 30+ SMS/sec only if provider approves |
| UK sending | Start 1-10 SMS/sec and adjust after approval/testing |

Per-minute examples:

```text
1 SMS/sec  = 60 SMS/minute
5 SMS/sec  = 300 SMS/minute
10 SMS/sec = 600 SMS/minute
30 SMS/sec = 1,800 SMS/minute
```

The admin should be able to configure:

```text
Default messages per second
Maximum messages per minute
Daily sending cap
Campaign sending cap
Retry failed messages
Pause campaign if failure rate is high
Pause campaign if unsubscribe rate is high
```

---

## 13. Queue System

A queue is required for campaign sending.

Recommended queue:

```text
Redis + BullMQ
```

Why queue is needed:

- Prevent API overload.
- Respect Vonage limits.
- Pause/resume campaigns.
- Retry failed sends.
- Track message status.
- Avoid server crash when sending to thousands of contacts.

Queue flow:

```text
User clicks Send Campaign
↓
Backend creates message records
↓
Backend adds jobs to BullMQ queue
↓
Worker sends SMS at configured rate
↓
Vonage returns message ID
↓
Database updates message status
```

Manual SMS can be sent directly or through a high-priority queue. Recommended:

```text
Manual SMS = high-priority queue
Campaign SMS = normal queue
```

This way, manual replies are not delayed behind large campaigns.

---

## 14. Delivery Tracking

Vonage delivery receipts should update message status.

Statuses to store:

```text
queued
sent
accepted
delivered
failed
rejected
expired
unknown
replied
unsubscribed
```

Delivery tracking flow:

```text
Vonage sends delivery webhook
↓
Backend receives status
↓
Backend finds message by provider_message_id
↓
Backend updates message status
↓
Frontend dashboard updates
```

---

## 15. Webhook Endpoints

Required webhooks:

```text
POST /webhooks/vonage/inbound
POST /webhooks/vonage/status
```

### Inbound SMS webhook

Purpose:

- Receive customer replies.
- Save reply to database.
- Detect STOP/unsubscribe.
- Show reply in inbox.

### Delivery status webhook

Purpose:

- Receive delivery status.
- Update message record.
- Track failed/delivered messages.

During development, use:

```text
ngrok http 3000
```

Example webhook URL:

```text
https://your-ngrok-url.ngrok-free.app/webhooks/vonage/inbound
```

In production, use a real HTTPS domain.

---

## 16. STOP / Unsubscribe Handling

The app must automatically detect opt-out messages.

Keywords:

```text
STOP
UNSUBSCRIBE
REMOVE
CANCEL
END
QUIT
NO
DON'T TEXT ME
PLEASE REMOVE ME
```

When detected:

```text
1. Mark contact as unsubscribed.
2. Add phone number to suppression list.
3. Stop all future campaigns to that number.
4. Block manual sending unless explicitly re-opted-in.
5. Save unsubscribe timestamp and source.
```

Suppression list fields:

```text
id
workspace_id
phone
reason
source
created_at
```

---

## 17. Cost Calculator

Before sending, show estimated cost.

Inputs:

```text
Number of recipients
SMS segments per message
Destination country
Provider rate
Carrier fee
Estimated inbound reply cost
```

Formula:

```text
Estimated cost = recipients × segments × rate_per_segment
```

For US campaigns, include:

```text
Base Vonage SMS rate
Carrier pass-through fee
10DLC monthly/campaign fees
Number rental
```

Frontend should show:

```text
Recipients: 5,000
Characters: 145
SMS Segments: 1
Estimated Cost: $XX.XX
```

---

## 18. SMS Segment Counter

SMS messages are billed by segments.

General rules:

```text
Standard GSM SMS: 160 characters per segment
Long SMS: split into multiple segments
Unicode/emojis reduce character limit
```

The app should show:

```text
Character count
Segment count
Estimated cost
Warning for emojis/special characters
```

---

## 19. Message Validation

Before sending a marketing campaign, validate:

```text
Message is not empty
Message has opt-out text
No banned or risky content
No misleading sender identity
No broken personalization variables
No unsupported characters without warning
```

Example blocked content categories:

```text
Phishing
Fake financial offers
Illegal drugs
Gambling
Adult content
Fraud/scams
Misleading links
```

---

## 20. Dashboard Features

Dashboard should show:

```text
Total contacts
Opted-in contacts
Unsubscribed contacts
Messages sent today
Replies today
Failed messages
Active campaigns
Estimated monthly cost
Delivery rate
Reply rate
```

Campaign stats:

```text
Sent
Delivered
Failed
Replies
Unsubscribed
Cost
Status
Created by
Created date
```

---

## 21. Reports

Reports page should include:

- Campaign report.
- Contact growth report.
- Delivery report.
- Failed messages report.
- Reply report.
- Unsubscribe report.
- Cost report.
- Agent activity report.

Filters:

```text
Date range
Campaign
Country
Sender number
Status
Agent
```

---

## 22. Numbers Management

Users should be able to manage sender numbers.

Features:

```text
Add Vonage number
View number status
Assign number to workspace/team
Select default number
Country
Number type
Inbound enabled
Campaign assigned
```

Number fields:

```text
id
workspace_id
provider
phone_number
country
type
status
is_default
created_at
```

---

## 23. Provider Settings

Admin settings should include:

```text
Vonage API key
Vonage API secret
Default sender number
Inbound webhook URL
Delivery webhook URL
Default country
Default send rate
Daily limit
Opt-out keywords
```

Important security note:

```text
Do not store API secrets in plain text.
Use environment variables or encrypted storage.
```

---

## 24. Recommended Tech Stack

### Frontend

```text
React.js or Next.js
Bootstrap / Tailwind / simple CSS
Axios
Socket.io client for live inbox
```

### Backend

```text
Node.js + Express.js
```

Alternative:

```text
NestJS for larger production project
```

### Database

Recommended:

```text
PostgreSQL
```

Alternative:

```text
MongoDB
```

### Queue

```text
Redis + BullMQ
```

### Hosting

Beginner-friendly:

```text
Frontend: Vercel
Backend: Render/Railway
Database: Supabase/Neon/MongoDB Atlas
Redis: Upstash/Railway
```

More professional:

```text
VPS
Docker
Nginx
PostgreSQL
Redis
SSL certificate
```

---

## 25. Suggested Architecture

```text
Frontend Dashboard
        ↓
Backend API
        ↓
Database
        ↓
Queue System
        ↓
Vonage SMS API
        ↓
Customer Phone

Customer Reply
        ↓
Vonage Inbound Webhook
        ↓
Backend
        ↓
Database
        ↓
Inbox UI
```

---

## 26. Database Tables

### users

```text
id
name
email
password_hash
role
workspace_id
created_at
updated_at
```

### workspaces

```text
id
company_name
owner_id
status
country
created_at
updated_at
```

### contacts

```text
id
workspace_id
name
phone
country
email
tags
consent_status
consent_source
consent_date
is_unsubscribed
unsubscribed_at
created_at
updated_at
```

### campaigns

```text
id
workspace_id
title
message_template
status
send_rate
scheduled_at
created_by
created_at
updated_at
```

### messages

```text
id
workspace_id
campaign_id
contact_id
direction
to_number
from_number
message_body
provider
provider_message_id
status
segments
cost_estimate
error_message
sent_at
delivered_at
created_at
updated_at
```

### replies

```text
id
workspace_id
contact_id
from_number
to_number
message_body
provider_message_id
received_at
created_at
```

### conversations

```text
id
workspace_id
contact_id
assigned_to
status
last_message_at
created_at
updated_at
```

### numbers

```text
id
workspace_id
provider
phone_number
country
type
status
is_default
created_at
updated_at
```

### suppression_list

```text
id
workspace_id
phone
reason
source
created_at
```

### webhook_logs

```text
id
workspace_id
provider
event_type
payload
created_at
```

---

## 27. Backend API Routes

### Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Contacts

```text
GET    /api/contacts
POST   /api/contacts
POST   /api/contacts/import
GET    /api/contacts/:id
PUT    /api/contacts/:id
DELETE /api/contacts/:id
```

### Manual SMS

```text
POST /api/manual-sms/send
GET  /api/manual-sms/history/:phone
```

### Campaigns

```text
GET  /api/campaigns
POST /api/campaigns
GET  /api/campaigns/:id
PUT  /api/campaigns/:id
POST /api/campaigns/:id/send
POST /api/campaigns/:id/pause
POST /api/campaigns/:id/resume
POST /api/campaigns/:id/cancel
```

### Inbox

```text
GET  /api/inbox/conversations
GET  /api/inbox/conversations/:id
POST /api/inbox/conversations/:id/reply
PUT  /api/inbox/conversations/:id/assign
PUT  /api/inbox/conversations/:id/close
```

### Reports

```text
GET /api/reports/dashboard
GET /api/reports/campaigns
GET /api/reports/messages
GET /api/reports/costs
```

### Numbers

```text
GET  /api/numbers
POST /api/numbers
PUT  /api/numbers/:id
DELETE /api/numbers/:id
```

### Webhooks

```text
POST /webhooks/vonage/inbound
POST /webhooks/vonage/status
```

---

## 28. Frontend Pages

Required pages:

```text
Login
Register
Dashboard
Contacts
Import Contacts
Manual SMS / Dialpad
Campaigns
Create Campaign
Campaign Details
Inbox
Numbers
Reports
Settings
Billing
Compliance
Team Members
```

---

## 29. Manual SMS / Dialpad UI Layout

Suggested UI:

```text
------------------------------------------------
Manual SMS
------------------------------------------------

From Number: [Dropdown]
To Number:   [+15551234567            ]
Contact:     [Search existing contact ]

Message:
[ Write your message here...              ]

Characters: 85
Segments: 1
Estimated Cost: $0.01

[Send SMS]

------------------------------------------------
Conversation History
------------------------------------------------
You: Hi, are you available?
Customer: Yes, tell me more.
You: Great, here are the details...
```

---

## 30. Campaign UI Layout

Suggested UI:

```text
------------------------------------------------
Create Campaign
------------------------------------------------

Campaign Name: [June Offer]

Select List: [Opted-in US Leads]

Message:
Hi {{name}}, we have an offer today. Reply YES for details. Reply STOP to opt out.

Recipients: 5,000
Excluded unsubscribed: 240
Valid numbers: 4,760
Characters: 105
Segments: 1
Estimated Cost: $XX.XX

Send Rate: [5 SMS/sec]

[Save Draft] [Send Now] [Schedule]
```

---

## 31. Development Phases

### Phase 1: Project Setup

- Create frontend.
- Create backend.
- Connect database.
- Setup environment variables.
- Setup GitHub repository.
- Setup basic folder structure.

### Phase 2: Authentication

- Register.
- Login.
- JWT/session.
- User roles.
- Protected routes.

### Phase 3: Contacts

- Add contact.
- View contacts.
- Edit/delete contacts.
- CSV import.
- Duplicate detection.
- Consent fields.

### Phase 4: Vonage Basic Integration

- Send one test SMS.
- Receive one reply.
- Receive delivery receipt.
- Save message and reply in database.

### Phase 5: Manual Dialpad SMS

- Build manual SMS page.
- Enter number and message.
- Send SMS.
- Show delivery status.
- Show conversation history.

### Phase 6: Campaigns

- Create campaign.
- Select contacts.
- Preview message.
- Send campaign.
- Save message records.

### Phase 7: Queue System

- Add Redis.
- Add BullMQ.
- Send campaign messages at controlled rate.
- Pause/resume/cancel.
- Retry failures.

### Phase 8: Inbox

- Conversation list.
- Reply screen.
- Assign conversations.
- Show incoming replies live.
- Auto-detect STOP.

### Phase 9: Compliance

- Opt-in tracking.
- Suppression list.
- STOP unsubscribe.
- Country rules.
- Marketing message validation.

### Phase 10: Analytics

- Dashboard stats.
- Campaign reports.
- Cost estimates.
- Delivery/reply/unsubscribe rates.

### Phase 11: Production

- Docker.
- Hosting.
- Domain.
- HTTPS.
- Logs.
- Backups.
- Monitoring.
- Error alerts.

---

## 32. MVP Scope

Minimum version to build first:

```text
Login
Contacts
Manual SMS dialpad
Send SMS through Vonage
Receive replies
Inbox
STOP unsubscribe
Campaign creation
Queue-based campaign sending
Delivery tracking
Basic dashboard
```

Do not start with advanced billing, AI replies, or multi-tenant SaaS complexity until MVP works.

---

## 33. Future Advanced Features

Later features:

- AI reply suggestions.
- Auto-tagging replies.
- Payment/subscription plans.
- Multi-workspace SaaS.
- White-label client portals.
- Advanced compliance review.
- Smart sending time.
- Link tracking.
- A/B testing.
- CRM integrations.
- Zapier/webhook integrations.
- Email + SMS campaigns.
- WhatsApp integration.

---

## 34. Security Requirements

Security checklist:

```text
Hash passwords
Use HTTPS
Validate all API inputs
Protect webhooks
Rate limit login attempts
Encrypt provider credentials
Use environment variables
Add audit logs
Backup database
Use role permissions
Prevent CSV injection
Prevent XSS in inbox messages
```

---

## 35. What Not To Build

Do not build features for:

```text
SIM-bank sending
Carrier-limit bypass
Random number blasting
Fake sender spoofing
Ignoring opt-outs
Messaging without consent
Spam sending
Unlimited sending claims
```

The product should be sold as a compliant SMS CRM, not an unlimited sender.

---

## 36. Best Final Product Description

Use this as the project description:

```text
A compliant two-way SMS CRM and marketing dashboard for US/UK businesses using Vonage API. The app supports manual dialpad-style SMS, campaign sending to opted-in contacts, contact management, delivery tracking, replies inbox, unsubscribe handling, rate limiting, and campaign analytics.
```

---

## 37. Recommended Prompt for Codex/Cursor

Use this prompt with Codex/Cursor:

```text
Build a full-stack compliant SMS CRM web app using React frontend, Node.js Express backend, PostgreSQL database, Redis + BullMQ queue, and Vonage SMS API.

The app must include:
1. Authentication with roles.
2. Contact management with opt-in and unsubscribe status.
3. Manual dialpad-style SMS page where a user enters a phone number, selects a Vonage sender number, writes a message, and sends one-to-one SMS.
4. Campaign system for sending messages to opted-in contact lists.
5. Queue-based sending with configurable rate limits.
6. Vonage inbound SMS webhook for receiving replies.
7. Vonage delivery receipt webhook for updating message statuses.
8. Inbox/conversation UI for two-way messaging.
9. STOP/unsubscribe detection and suppression list.
10. Dashboard analytics for sent, delivered, failed, replies, unsubscribed, and cost estimate.
11. Secure environment variables for Vonage credentials.
12. Clean folder structure, beginner-friendly code comments, and README setup instructions.

Important:
- Do not build SIM-based sending.
- Do not bypass carrier or provider limits.
- Do not send to unsubscribed contacts.
- Always use rate-limited queue sending for campaigns.
- Manual SMS should still check unsubscribe and phone validation.
```

---

## 38. Final Checklist

Before launching, make sure you have:

```text
Vonage account
Vonage number
API key and secret
Inbound webhook configured
Delivery webhook configured
US 10DLC registration if sending US marketing SMS
UK sender setup if sending UK SMS
Frontend deployed
Backend deployed
Database deployed
Redis deployed
HTTPS domain
STOP unsubscribe working
Consent tracking working
Rate limits working
Delivery receipts working
Inbox working
Manual SMS working
Campaign sending working
Logs and monitoring working
```

---

## 39. Short Final Plan

Build in this order:

```text
1. Backend + database
2. Vonage send SMS test
3. Webhooks for replies/status
4. Manual SMS dialpad
5. Contacts
6. Campaigns
7. Queue sending
8. Inbox
9. STOP/unsubscribe
10. Dashboard and reports
11. Deployment
```

This gives you a real, sellable, safe SMS CRM app.
