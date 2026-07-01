const { queryOne } = require('../config/database');

async function workspaceForOrganization(organizationId) {
  const row = await queryOne(
    'SELECT id FROM workspaces WHERE organization_id = $1 ORDER BY id ASC LIMIT 1',
    [organizationId || 1]
  );
  return row?.id || 1;
}

async function resolveTenancy(user) {
  const organizationId = user.organization_id || 1;
  let workspaceId = user.workspace_id;
  if (!workspaceId) {
    workspaceId = await workspaceForOrganization(organizationId);
  }
  return { organizationId, workspaceId };
}

async function enrichUser(user) {
  if (!user) return user;
  const { organizationId, workspaceId } = await resolveTenancy(user);
  return {
    ...user,
    organization_id: organizationId,
    workspace_id: workspaceId,
  };
}

async function assertUserInOrg(actor, targetUserId) {
  if (!actor || actor.role === 'super_admin') return;
  const target = await queryOne('SELECT id, organization_id, role FROM users WHERE id = $1', [targetUserId]);
  if (!target) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  if (target.role === 'super_admin') {
    const error = new Error('Cannot modify super admin accounts');
    error.status = 403;
    throw error;
  }
  const actorOrg = actor.organization_id || 1;
  const targetOrg = target.organization_id || 1;
  if (actorOrg !== targetOrg) {
    const error = new Error('User is outside your organization');
    error.status = 403;
    throw error;
  }
}

async function getOrgBranding(organizationId) {
  const org = await queryOne(
    `SELECT id, name, brand_name, logo_url, primary_color, support_email, hipaa_mode, message_retention_days
     FROM organizations WHERE id = $1`,
    [organizationId || 1]
  );
  if (!org) {
    return {
      organizationId: 1,
      brandName: 'SignalMint',
      logoUrl: null,
      primaryColor: '#2563eb',
      supportEmail: null,
      hipaaMode: false,
    };
  }
  return {
    organizationId: org.id,
    brandName: org.brand_name || org.name || 'SignalMint',
    logoUrl: org.logo_url || null,
    primaryColor: org.primary_color || '#2563eb',
    supportEmail: org.support_email || null,
    hipaaMode: Boolean(org.hipaa_mode),
    messageRetentionDays: org.message_retention_days,
  };
}

module.exports = {
  workspaceForOrganization,
  resolveTenancy,
  enrichUser,
  assertUserInOrg,
  getOrgBranding,
};
