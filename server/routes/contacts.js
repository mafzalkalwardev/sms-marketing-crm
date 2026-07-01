const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const { search = '', country = '', consent = '', unsubscribed = '' } = req.query;

    let sql = isAdmin ? 'SELECT * FROM contacts WHERE 1=1' : 'SELECT * FROM contacts WHERE user_id = $1';
    const params = isAdmin ? [] : [userId];
    let idx = params.length + 1;

    if (search) {
      sql += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx + 1} OR email ILIKE $${idx + 2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      idx += 3;
    }
    if (country) {
      sql += ` AND country = $${idx}`;
      params.push(country);
      idx += 1;
    }
    if (consent) {
      sql += ` AND consent_status = $${idx}`;
      params.push(consent);
      idx += 1;
    }
    if (unsubscribed !== '') {
      sql += ` AND is_unsubscribed = $${idx}`;
      params.push(unsubscribed === 'true');
    }
    sql += ' ORDER BY created_at DESC, id DESC';

    const contacts = await queryAll(sql, params);
    res.json(contacts);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, country, email, tags, consent_status, consent_source, notes } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const result = await query(
      `INSERT INTO contacts (user_id, workspace_id, name, phone, country, email, tags, notes, consent_status, consent_source, consent_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING id`,
      [req.user.id, 1, name || '', phone, country || 'US', email || null, tags || '', notes || '', consent_status || 'unknown', consent_source || 'manual']
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, phone, country, email, tags, consent_status, is_unsubscribed, notes } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (isAdmin) {
      await query(
        `UPDATE contacts SET name = $1, phone = $2, country = $3, email = $4, tags = $5, notes = $6,
         consent_status = $7, is_unsubscribed = $8, updated_at = NOW() WHERE id = $9`,
        [name, phone, country, email, tags, notes || '', consent_status, Boolean(is_unsubscribed), req.params.id]
      );
    } else {
      await query(
        `UPDATE contacts SET name = $1, phone = $2, country = $3, email = $4, tags = $5, notes = $6,
         consent_status = $7, is_unsubscribed = $8, updated_at = NOW() WHERE id = $9 AND user_id = $10`,
        [name, phone, country, email, tags, notes || '', consent_status, Boolean(is_unsubscribed), req.params.id, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (isAdmin) {
      await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    } else {
      await query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const { normalizePhone } = require('../services/smsService');

router.post('/save-from-conversation', async (req, res, next) => {
  try {
    const { phone, name, email, tags, notes, consent_status, conversation_id } = req.body;
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) return res.status(400).json({ error: 'Phone number is required' });

    const userId = req.user.id;

    let contact = await queryOne('SELECT * FROM contacts WHERE user_id = $1 AND phone = $2', [userId, phoneNorm]);
    let contactId;
    if (contact) {
      await query(
        'UPDATE contacts SET name = $1, email = $2, tags = $3, notes = $4, updated_at = NOW() WHERE id = $5',
        [name || contact.name, email || contact.email, tags || contact.tags, notes || contact.notes, contact.id]
      );
      contactId = contact.id;
    } else {
      const result = await query(
        `INSERT INTO contacts (user_id, workspace_id, name, phone, country, email, tags, notes, consent_status, consent_source, consent_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'conversation', NOW()) RETURNING id`,
        [userId, 1, name || phoneNorm, phoneNorm, 'US', email || null, tags || '', notes || '', consent_status || 'unknown']
      );
      contactId = result.rows[0].id;
    }

    if (conversation_id) {
      const conversation = await queryOne(
        'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
        [conversation_id, userId]
      );
      if (conversation) {
        await query(
          'UPDATE conversations SET contact_id = $1, phone = $2, updated_at = NOW() WHERE id = $3',
          [contactId, phoneNorm, conversation.id]
        );
      }
    }

    res.json({ ok: true, contactId, contact: await queryOne('SELECT * FROM contacts WHERE id = $1', [contactId]) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
