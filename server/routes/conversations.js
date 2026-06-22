const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendTextMessage, normalizePhone, isValidPhone } = require('../services/smsService');

const router = express.Router();

function conversationList(userId, isAdmin) {
  if (isAdmin) {
    return db.prepare(
      `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
       FROM conversations c
       JOIN contacts ON contacts.id = c.contact_id
       ORDER BY datetime(c.last_message_at) DESC, c.id DESC`
    ).all().map((conversation) => ({
      ...conversation,
      lastMessage: messagePreviewAdmin(conversation.id),
    }));
  }
  return db.prepare(
    `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
     FROM conversations c
     JOIN contacts ON contacts.id = c.contact_id
     WHERE c.user_id = ?
     ORDER BY datetime(c.last_message_at) DESC, c.id DESC`
  ).all(userId).map((conversation) => ({
    ...conversation,
    lastMessage: messagePreview(conversation.id),
  }));
}

function messagePreview(conversationId) {
  const message = db.prepare(
    'SELECT message_body, created_at, status FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1'
  ).get(conversationId);
  return message || null;
}

function messagePreviewAdmin(conversationId) {
  const message = db.prepare(
    'SELECT message_body, created_at, status FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1'
  ).get(conversationId);
  return message || null;
}

router.get('/', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  res.json(conversationList(req.user.id, isAdmin));
});

router.get('/:id', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const conversations = conversationList(req.user.id, isAdmin);
  const conversation = conversations.find((row) => row.id === Number(req.params.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conversation);
});

router.get('/:id/messages', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const conversations = conversationList(req.user.id, isAdmin);
  const conversation = conversations.find((row) => row.id === Number(req.params.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare("UPDATE conversations SET unread_count = 0, updated_at = datetime('now') WHERE id = ?").run(conversation.id);
  res.json(db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC, id ASC').all(conversation.id));
});

router.post('/start', authenticate, async (req, res) => {
  const { to, phone, name, from, from_number, message } = req.body;
  const phoneNorm = normalizePhone(to || phone);
  if (!isValidPhone(phoneNorm)) return res.status(400).json({ error: 'Phone must be valid E.164 format' });

  const userId = req.user.id;
  const workspaceId = 1;

  let contact = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND phone = ?').get(userId, phoneNorm);
  if (!contact) {
    const result = db.prepare(
      "INSERT INTO contacts (user_id, workspace_id, name, phone, country, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(userId, workspaceId, name || phoneNorm, phoneNorm, 'US', 'unknown', 'manual');
    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  }

  let conversation = db.prepare('SELECT * FROM conversations WHERE user_id = ? AND contact_id = ?').get(userId, contact.id);
  if (!conversation) {
    const result = db.prepare(
      "INSERT INTO conversations (user_id, workspace_id, contact_id, phone, status, unread_count, last_message_at) VALUES (?, ?, ?, ?, 'open', 0, datetime('now'))"
    ).run(userId, workspaceId, contact.id, phoneNorm);
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  }

  let savedMessage = null;
  let sendResult = null;
  if (message && String(message).trim()) {
    sendResult = await sendTextMessage({
      user: req.user,
      to: phoneNorm,
      from: from || from_number,
      message,
      contactName: name,
      workspaceId,
    });
    savedMessage = sendResult.message;
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(sendResult.conversation.id);
  }

  res.json({
    ok: sendResult ? sendResult.ok : true,
    mode: sendResult?.mode || 'mock',
    provider: sendResult?.provider,
    providerMessageId: sendResult?.providerMessageId,
    conversation,
    conversationId: conversation.id,
    contact,
    message: savedMessage,
    error: sendResult?.error,
  });
});

router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const conversations = conversationList(req.user.id, isAdmin);
    const conversation = conversations.find((row) => row.id === Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.is_unsubscribed) return res.status(403).json({ error: 'This contact is unsubscribed.' });

    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const result = await sendTextMessage({
      user: req.user,
      to: conversation.phone,
      from: req.body.from,
      message,
      contactName: conversation.name,
      workspaceId: 1,
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: result.mode,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
