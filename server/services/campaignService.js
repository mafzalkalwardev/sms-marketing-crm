const { query, queryOne, queryAll } = require('../config/database');
const { sendTextMessage } = require('./smsService');
const { CAMPAIGN_STATUSES, transitionCampaign } = require('./campaignStateService');
const { RECIPIENT_STATUSES } = require('../domain/states');

async function campaignForUser(id, userId, workspaceId, isAdmin) {
  if (isAdmin) {
    return queryOne('SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  }
  return queryOne(
    'SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2 AND (user_id = $3 OR created_by = $3)',
    [id, workspaceId, userId]
  );
}

async function eligibleContacts(userId, workspaceId, isAdmin) {
  const sql = isAdmin
    ? `SELECT * FROM contacts
       WHERE workspace_id = $1
         AND is_unsubscribed = FALSE
         AND consent_status = 'opted_in'
         AND phone NOT IN (SELECT phone FROM suppression_list WHERE workspace_id = $1)`
    : `SELECT * FROM contacts
       WHERE workspace_id = $1
         AND user_id = $2
         AND is_unsubscribed = FALSE
         AND consent_status = 'opted_in'
         AND phone NOT IN (SELECT phone FROM suppression_list WHERE workspace_id = $1 AND (user_id = $2 OR user_id IS NULL))`;
  return isAdmin ? queryAll(sql, [workspaceId]) : queryAll(sql, [workspaceId, userId]);
}

async function previewCampaign(campaign, userId, workspaceId, isAdmin) {
  const contacts = await eligibleContacts(userId, workspaceId, isAdmin);
  const { countSegments, estimateCost } = require('./smsService');
  const segments = countSegments(campaign.message_template);
  const excludedRow = await queryOne(
    `SELECT COUNT(*)::int AS n FROM contacts
     WHERE workspace_id = $1
       AND (is_unsubscribed = TRUE OR consent_status != $2)`,
    [workspaceId, 'opted_in']
  );
  return {
    recipients: contacts.length,
    excluded: excludedRow?.n || 0,
    segments,
    estimatedCost: Number((contacts.length * estimateCost(segments)).toFixed(4)),
    sample: contacts.slice(0, 5).map((contact) => ({
      contactId: contact.id,
      phone: contact.phone,
      message: campaign.message_template.replaceAll('{{name}}', contact.name || ''),
    })),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedPendingRecipients(campaignId, contacts) {
  for (const contact of contacts) {
    await query(
      `INSERT INTO campaign_recipients (campaign_id, contact_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
      [campaignId, contact.id, RECIPIENT_STATUSES.PENDING]
    );
  }
}

async function prepareCampaignSend({ campaignId, user, workspaceId, fromNumber }) {
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  const contacts = await eligibleContacts(user.id, workspaceId, isAdmin);
  const resolvedFrom = fromNumber || campaign.from_number;

  if ([CAMPAIGN_STATUSES.DRAFT, CAMPAIGN_STATUSES.SCHEDULED].includes(campaign.status)) {
    await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.QUEUED, { source: 'queue_send' });
  }
  if (![CAMPAIGN_STATUSES.SENDING, CAMPAIGN_STATUSES.QUEUED, CAMPAIGN_STATUSES.PAUSED].includes(campaign.status)) {
    const latest = await queryOne('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    if (latest.status !== CAMPAIGN_STATUSES.SENDING) {
      await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.SENDING, { source: 'queue_send' });
    }
  } else if (campaign.status === CAMPAIGN_STATUSES.QUEUED || campaign.status === CAMPAIGN_STATUSES.PAUSED) {
    await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.SENDING, { source: 'queue_send' });
  }

  await seedPendingRecipients(campaign.id, contacts);
  await query(
    'UPDATE campaigns SET stats_json = $1::jsonb, started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $2',
    [JSON.stringify({ total: contacts.length, sent: 0, failed: 0, skipped: 0, pending: contacts.length }), campaign.id]
  );

  return {
    campaign: await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaign.id]),
    contacts,
    fromNumber: resolvedFrom,
  };
}

async function sendCampaignRecipient({ campaignId, contactId, userId, fromNumber, workspaceId }) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) {
    const error = new Error('Campaign user not found');
    error.status = 404;
    throw error;
  }

  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  if ([CAMPAIGN_STATUSES.PAUSED, CAMPAIGN_STATUSES.CANCELLED].includes(campaign.status)) {
    return { ok: true, skipped: true, reason: campaign.status };
  }

  if ([CAMPAIGN_STATUSES.COMPLETED, CAMPAIGN_STATUSES.FAILED].includes(campaign.status)) {
    return { ok: true, skipped: true, reason: campaign.status };
  }

  const contact = await queryOne(
    'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
    [contactId, workspaceId]
  );
  if (!contact) {
    return { ok: false, skipped: true, reason: 'contact_missing' };
  }

  const existing = await queryOne(
    'SELECT * FROM campaign_recipients WHERE campaign_id = $1 AND contact_id = $2',
    [campaignId, contactId]
  );
  if (existing?.status === RECIPIENT_STATUSES.SENT) {
    return { ok: true, skipped: true, reason: 'already_sent' };
  }

  const recipient = await queryOne(
    `INSERT INTO campaign_recipients (campaign_id, contact_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (campaign_id, contact_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [campaignId, contactId, RECIPIENT_STATUSES.SENDING]
  );

  const body = campaign.message_template.replaceAll('{{name}}', contact.name || '');
  const resolvedFrom = fromNumber || campaign.from_number;

  try {
    const result = await sendTextMessage({
      user,
      to: contact.phone,
      from: resolvedFrom,
      message: body,
      contactName: contact.name,
      workspaceId,
      campaignId,
      idempotencyKey: `campaign_${campaignId}_contact_${contactId}`,
    });

    const recipientStatus = result.ok ? RECIPIENT_STATUSES.SENT : RECIPIENT_STATUSES.FAILED;
    await query(
      `UPDATE campaign_recipients
       SET status = $1, message_id = $2, error_message = $3, updated_at = NOW()
       WHERE id = $4`,
      [recipientStatus, result.message?.id || null, result.error || null, recipient.id]
    );

    if (!result.ok) {
      const error = new Error(result.error || 'Send failed');
      error.recipientStatus = RECIPIENT_STATUSES.FAILED;
      throw error;
    }

    await maybeFinalizeCampaign(campaignId);
    return { ok: true, status: recipientStatus };
  } catch (error) {
    await query(
      `UPDATE campaign_recipients
       SET status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3`,
      [RECIPIENT_STATUSES.FAILED, error.message, recipient.id]
    );
    await maybeFinalizeCampaign(campaignId);
    throw error;
  }
}

async function recipientCounts(campaignId) {
  const rows = await queryAll(
    `SELECT status, COUNT(*)::int AS count
     FROM campaign_recipients
     WHERE campaign_id = $1
     GROUP BY status`,
    [campaignId]
  );
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

async function maybeFinalizeCampaign(campaignId) {
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) return null;
  if ([CAMPAIGN_STATUSES.PAUSED, CAMPAIGN_STATUSES.CANCELLED, CAMPAIGN_STATUSES.COMPLETED, CAMPAIGN_STATUSES.FAILED].includes(campaign.status)) {
    return campaign;
  }

  const counts = await recipientCounts(campaignId);
  const total = campaign.stats_json?.total
    || Object.values(counts).reduce((sum, n) => sum + n, 0);
  const pending = (counts[RECIPIENT_STATUSES.PENDING] || 0)
    + (counts[RECIPIENT_STATUSES.QUEUED] || 0)
    + (counts[RECIPIENT_STATUSES.SENDING] || 0);
  const sent = counts[RECIPIENT_STATUSES.SENT] || 0;
  const failed = counts[RECIPIENT_STATUSES.FAILED] || 0;
  const skipped = counts[RECIPIENT_STATUSES.SKIPPED] || 0;

  const stats = { total, sent, failed, skipped, pending };
  await query(
    'UPDATE campaigns SET stats_json = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(stats), campaignId]
  );

  if (pending > 0) return null;

  const finalStatus = total > 0 && failed === total
    ? CAMPAIGN_STATUSES.FAILED
    : CAMPAIGN_STATUSES.COMPLETED;

  return transitionCampaign(campaignId, finalStatus, { source: 'queue_send', stats });
}

async function sendCampaign({ campaign, user, fromNumber, workspaceId }) {
  const { contacts, fromNumber: resolvedFrom } = await prepareCampaignSend({
    campaignId: campaign.id,
    user,
    workspaceId,
    fromNumber,
  });

  const sendRate = Math.max(1, Number(campaign.send_rate || 1));
  const delayMs = Math.floor(1000 / sendRate);
  const stats = { total: contacts.length, sent: 0, failed: 0, skipped: 0 };

  for (const contact of contacts) {
    const current = await queryOne('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    if (current.status === CAMPAIGN_STATUSES.PAUSED) {
      stats.paused = true;
      break;
    }
    if (current.status === CAMPAIGN_STATUSES.CANCELLED) {
      stats.cancelled = true;
      break;
    }

    try {
      const result = await sendCampaignRecipient({
        campaignId: campaign.id,
        contactId: contact.id,
        userId: user.id,
        fromNumber: resolvedFrom,
        workspaceId,
      });
      if (result.skipped && result.reason === 'already_sent') stats.skipped += 1;
      else if (result.ok) stats.sent += 1;
    } catch {
      stats.failed += 1;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  if (!stats.paused && !stats.cancelled) {
    await maybeFinalizeCampaign(campaign.id);
  } else {
    await query(
      'UPDATE campaigns SET stats_json = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(stats), campaign.id]
    );
  }

  const final = await queryOne('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
  return { ok: true, status: final.status, stats, mode: 'queue' };
}

async function resumeCampaign({ campaign, user, fromNumber, workspaceId }) {
  if (campaign.status !== CAMPAIGN_STATUSES.PAUSED) {
    const error = new Error('Only paused campaigns can be resumed');
    error.status = 409;
    throw error;
  }
  await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.QUEUED, { source: 'api_resume' });
  const campaignQueue = require('./campaignQueue');
  return campaignQueue.enqueueCampaign({
    campaignId: campaign.id,
    userId: user.id,
    fromNumber,
    workspaceId,
    resume: true,
  });
}

async function getCampaignProgress(campaignId) {
  const campaign = await queryOne('SELECT stats_json, status FROM campaigns WHERE id = $1', [campaignId]);
  const counts = await recipientCounts(campaignId);
  const total = campaign?.stats_json?.total
    || Object.values(counts).reduce((sum, n) => sum + n, 0);
  const sent = counts[RECIPIENT_STATUSES.SENT] || 0;
  const failed = counts[RECIPIENT_STATUSES.FAILED] || 0;
  const skipped = counts[RECIPIENT_STATUSES.SKIPPED] || 0;
  const pending = (counts[RECIPIENT_STATUSES.PENDING] || 0)
    + (counts[RECIPIENT_STATUSES.QUEUED] || 0)
    + (counts[RECIPIENT_STATUSES.SENDING] || 0);
  const done = sent + failed + skipped;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return {
    status: campaign?.status,
    total,
    sent,
    failed,
    skipped,
    pending,
    percent,
    counts,
  };
}

async function getCampaignStats(campaignId) {
  const progress = await getCampaignProgress(campaignId);
  const events = await queryAll(
    `SELECT from_status, to_status, source, created_at
     FROM campaign_status_events
     WHERE campaign_id = $1
     ORDER BY created_at ASC`,
    [campaignId]
  );
  const deadLetters = await queryAll(
    `SELECT id, contact_id, error_message, attempts, created_at
     FROM campaign_job_dead_letters
     WHERE campaign_id = $1 AND resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT 50`,
    [campaignId]
  );
  return {
    recipients: progress.counts,
    progress,
    timeline: events,
    deadLetters,
  };
}

async function listFailedRecipientIds(campaignId) {
  const rows = await queryAll(
    `SELECT contact_id FROM campaign_recipients
     WHERE campaign_id = $1 AND status = $2`,
    [campaignId, RECIPIENT_STATUSES.FAILED]
  );
  return rows.map((row) => row.contact_id);
}

async function retryFailedRecipients({ campaignId, userId, workspaceId, fromNumber }) {
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  const contactIds = await listFailedRecipientIds(campaignId);
  if (contactIds.length === 0) {
    return { ok: true, retried: 0 };
  }

  await query(
    `UPDATE campaign_recipients SET status = $1, error_message = NULL, updated_at = NOW()
     WHERE campaign_id = $2 AND status = $3`,
    [RECIPIENT_STATUSES.PENDING, campaignId, RECIPIENT_STATUSES.FAILED]
  );

  await query(
    `UPDATE campaign_job_dead_letters SET resolved_at = NOW()
     WHERE campaign_id = $1 AND resolved_at IS NULL`,
    [campaignId]
  );

  if (campaign.status === CAMPAIGN_STATUSES.COMPLETED || campaign.status === CAMPAIGN_STATUSES.FAILED) {
    await transitionCampaign(campaignId, CAMPAIGN_STATUSES.QUEUED, { source: 'api_retry' });
  }

  const campaignQueue = require('./campaignQueue');
  return campaignQueue.enqueueRecipients({
    campaignId,
    userId,
    workspaceId,
    fromNumber: fromNumber || campaign.from_number,
    contactIds,
    resume: true,
  });
}

module.exports = {
  campaignForUser,
  eligibleContacts,
  previewCampaign,
  prepareCampaignSend,
  sendCampaignRecipient,
  maybeFinalizeCampaign,
  sendCampaign,
  resumeCampaign,
  getCampaignStats,
  getCampaignProgress,
  retryFailedRecipients,
  listFailedRecipientIds,
};
