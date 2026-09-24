const ROLES = {
  ADMINISTRATOR: 'school-administrator',
  STAFF: 'school-staff',
  PARENT: 'parent-guardian'
};

function claimsFromLocalUser(user) {
  if (!user || typeof user !== 'object' || typeof user.sub !== 'string' || typeof user.schoolId !== 'string') {
    throw new Error('Unauthorized: malformed local mock user.');
  }
  return {
    sub: user.sub,
    schoolId: user.schoolId,
    'cognito:groups': Array.isArray(user.groups) ? user.groups : [],
    roles: Array.isArray(user.roles) ? user.roles : []
  };
}

function schoolIdFromClaims(claims) {
  return claims?.schoolId || claims?.['custom:schoolId'];
}

function authorize({ claims, schoolId, allowedRoles = Object.values(ROLES), action = 'read' }) {
  const claimSchoolId = schoolIdFromClaims(claims);
  if (!claims?.sub || !claimSchoolId || claimSchoolId !== schoolId) throw new Error('Forbidden: school tenant mismatch.');
  const groups = [...(claims['cognito:groups'] || []), ...(claims.groups || []), ...(claims.roles || [])];
  const roleAllowed = groups.some((group) => allowedRoles.includes(group));
  if (!roleAllowed) throw new Error(`Forbidden: role cannot ${action} this resource.`);
  if (action === 'write-policy' && !groups.includes(ROLES.ADMINISTRATOR)) {
    throw new Error('Forbidden: only school administrators can manage configuration.');
  }
  if (action === 'acknowledge' && groups.includes(ROLES.PARENT)) {
    throw new Error('Forbidden: parents cannot acknowledge operational alerts.');
  }
  return true;
}

function bearerClaims(req) {
  const mode = process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'production' : 'local');
  if (mode === 'production') {
    const header = req.headers.authorization;
    if (!header || !/^Bearer [^ ]+$/.test(header)) throw new Error('Unauthorized.');
    throw new Error('Cognito JWT verification must be provided by API Gateway.');
  }
  const user = req.headers['x-local-user'];
  if (!user) throw new Error('Unauthorized: local mock user header required.');
  try {
    return claimsFromLocalUser(JSON.parse(user));
  } catch {
    throw new Error('Unauthorized: malformed local mock user.');
  }
}

module.exports = { ROLES, authorize, bearerClaims, claimsFromLocalUser };
