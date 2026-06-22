const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  const { search = '', country = '', consent = '', unsubscribed = '' } = req.query;

  let sql = isAdmin ? 'SELECT * FROM contacts WHERE 1=1' : 'SELECT * FROM contacts WHERE user_id = ?';
  const params = isAdmin ? [] : [userId];

  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (country) { sql += ' AND country = ?'; params.push(country); }
  if (consent) { sql += ' AND consent_status = ?'; params.push(consent); }
  if (unsubscribed !== '') {
    sql += ' AND is_unsubscribed = ?';
    params.push(unsubscribed === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC';
  const contacts = db.prepare(sql).all(...params);
  res.json(contacts);
});

router.post('/', (req, res) => {
  const { name, phone, country, email, tags, consent_status, consent_source, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const result = db.prepare(
    "INSERT INTO contacts (user_id, workspace_id, name, phone, country, email, tags, notes, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(req.user.id, 1, name || '', phone, country || 'US', email || null, tags || '', notes || '', consent_status || 'unknown', consent_source || 'manual');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, phone, country, email, tags, consent_status, is_unsubscribed, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  const isAdmin = req.user.role === 'admin';
  const whereClause = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
  const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id];

  db.prepare(
    "UPDATE contacts SET name = ?, phone = ?, country = ?, email = ?, tags = ?, notes = ?, consent_status = ?, is_unsubscribed = ?, updated_at = datetime('now') WHERE " + whereClause
  ).run(name, phone, country, email, tags, notes || '', consent_status, is_unsubscribed ? 1 : 0, ...params);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const whereClause = isAdmin ? 'id = ?' : 'id = ? AND user_id = ?';
  const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
  db.prepare('DELETE FROM contacts WHERE ' + whereClause).run(...params);
  res.json({ ok: true });
});

router.post('/save-from-conversation', (req, res) => {
  const { phone, name, email, tags, notes, consent_status, conversation_id } = req.body;
  const phoneNorm = phone.replace(/[^\d+]/g, '');
  if (!phoneNorm) return res.status(400).json({ error: 'Phone number is required' });

  const userId = req.user.id;

  let contact = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND phone = ?').get(userId, phoneNorm);
  let contactId;
  if (contact) {
    db.prepare("UPDATE contacts SET name = ?, email = ?, tags = ?, notes = ?, updated_at = datetime('now') WHERE id = ?").run(name || contact.name, email || contact.email, tags || contact.tags, notes || contact.notes, contact.id);
    contactId = contact.id;
  } else {
    const result = db.prepare(
      "INSERT INTO contacts (user_id, workspace_id, name, phone, country, email, tags, notes, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(userId, 1, name || phoneNorm, phoneNorm, 'US', email || null, tags || '', notes || '', consent_status || 'unknown', 'conversation');
    contactId = result.lastInsertRowid;
  }

  if (conversation_id) {
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(conversation_id, userId);
    if (conversation) {
      db.prepare("UPDATE conversations SET contact_id = ?, phone = ?, updated_at = datetime('now') WHERE id = ?").run(contactId, phoneNorm, conversation.id);
    }
  }

  res.json({ ok: true, contactId });
});

module.exports = router;
