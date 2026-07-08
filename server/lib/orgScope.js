function bindOrgFilter(sql, req, alias = '', startIdx = 1) {
  if (req.user.role === 'super_admin') {
    return { sql, params: [], nextIdx: startIdx };
  }
  const col = alias ? `${alias}.` : '';
  const clause = ` AND ${col}role != 'super_admin' AND ${col}organization_id = $${startIdx} AND (${col}id = $${startIdx + 1} OR (${col}role = 'user' AND ${col}managed_by_admin_id = $${startIdx + 1}))`;
  return {
    sql: sql + clause,
    params: [req.user.organization_id || 1, req.user.id],
    nextIdx: startIdx + 2,
  };
}

function dataUserIdClause(actor, column = 'user_id', startIdx = 1) {
  if (actor.role === 'super_admin') {
    return { clause: '', params: [], nextIdx: startIdx };
  }
  if (actor.role === 'admin') {
    return {
      clause: ` AND ${column} IN (SELECT id FROM users WHERE organization_id = $${startIdx} AND (id = $${startIdx + 1} OR (role = 'user' AND managed_by_admin_id = $${startIdx + 1})))`,
      params: [actor.organization_id || 1, actor.id],
      nextIdx: startIdx + 2,
    };
  }
  return {
    clause: ` AND ${column} = $${startIdx}`,
    params: [actor.id],
    nextIdx: startIdx + 1,
  };
}

function conversationScopeClause(actor, convAlias = 'c', startIdx = 1) {
  return dataUserIdClause(actor, `${convAlias}.user_id`, startIdx);
}

async function assertContactAccess(actor, contactId, queryOne) {
  if (actor.role === 'super_admin') return true;
  const contact = await queryOne('SELECT user_id FROM contacts WHERE id = $1', [contactId]);
  if (!contact) {
    const error = new Error('Contact not found');
    error.status = 404;
    throw error;
  }
  if (actor.role === 'user' && contact.user_id !== actor.id) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
  if (actor.role === 'admin') {
    const owner = await queryOne(
      'SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND (id = $3 OR (role = $4 AND managed_by_admin_id = $3))',
      [contact.user_id, actor.organization_id || 1, actor.id, 'user']
    );
    if (!owner) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
  }
  return true;
}

module.exports = {
  bindOrgFilter,
  dataUserIdClause,
  conversationScopeClause,
  assertContactAccess,
};
