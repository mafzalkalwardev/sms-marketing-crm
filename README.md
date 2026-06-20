# SMS Marketing & Two-Way Messaging CRM

Compliant SMS CRM and marketing dashboard for US/UK businesses using Vonage API.
Supports manual dialpad-style SMS, campaign sending to opted-in contacts, contact management, delivery tracking, replies inbox, unsubscribe handling, rate limiting, and campaign analytics.

## Tech Stack
- Frontend: React
- Backend: Node.js + Express
- Database: SQLite (easy setup)
- Queue: BullMQ + Redis (optional for MVP)

## Getting Started
- Copy `.env.example` to `.env` and fill in your Vonage API key and secret.
- Install backend deps: `cd server && npm install`
- Install frontend deps: `cd client && npm install`
- Run backend: `cd server && npm run dev`
- Run frontend: `cd client && npm start`

## Features
- Authentication with JWT
- Contacts import & consent tracking
- Manual SMS dialpad
- Campaigns with scheduled sending
- Two-way inbox
- STOP/unsubscribe compliance
- Delivery tracking
- Dashboard analytics