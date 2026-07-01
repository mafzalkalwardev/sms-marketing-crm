function orgUserFilter(req, alias = '') {
  if (req.user.role === 'super_admin') {
    return { clause: '', params: [] };
  }
  const col = alias ? `${alias}.` : '';
  return {
    clause: ` AND ${col}role != 'super_admin' AND (${col}organization_id = $ORG OR ${col}managed_by_admin_id = $ADMIN OR ${col}id = $ADMIN)`,
    params: [req.user.organization_id || 1, req.user.id],
  };
}

function bindOrgFilter(sql, req, alias = '', startIdx = 1) {
  if (req.user.role === 'super_admin') {
    return { sql, params: [], nextIdx: startIdx };
  }
  const col = alias ? `${alias}.` : '';
  const clause = ` AND ${col}role != 'super_admin' AND (${col}organization_id = $${startIdx} OR ${col}managed_by_admin_id = $${startIdx + 1} OR ${col}id = $${startIdx + 1})`;
  return {
    sql: sql + clause,
    params: [req.user.organization_id || 1, req.user.id],
    nextIdx: startIdx + 2,
  };
}

module.exports = { orgUserFilter, bindOrgFilter };
