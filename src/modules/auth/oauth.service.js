const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const config = require('../../config');

const ALLOWED_ROLES = ['client', 'team_leader', 'specialist'];

const providers = {
  google: {
    name: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    extraAuthParams: { prompt: 'select_account' },
    credentials: () => config.oauth.google,
  },
  linkedin: {
    name: 'LinkedIn',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scope: 'openid profile email',
    extraAuthParams: {},
    credentials: () => config.oauth.linkedin,
  },
};

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getProvider = (provider) => {
  const definition = providers[provider];

  if (!definition) {
    throw createError('مزوّد تسجيل الدخول غير مدعوم', 400);
  }

  return definition;
};

const isConfigured = (provider) => {
  const { clientId, clientSecret } = getProvider(provider).credentials();
  return Boolean(clientId && clientSecret);
};

const createState = (provider, role) =>
  jwt.sign(
    {
      type: 'oauth_state',
      provider,
      role,
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    config.jwt.secret,
    { expiresIn: '10m' }
  );

const verifyState = (provider, state) => {
  if (!state) {
    throw createError('حالة تسجيل الدخول مفقودة', 400);
  }

  let payload;

  try {
    payload = jwt.verify(state, config.jwt.secret);
  } catch (error) {
    throw createError('حالة تسجيل الدخول غير صالحة أو منتهية', 400);
  }

  if (payload.type !== 'oauth_state' || payload.provider !== provider) {
    throw createError('حالة تسجيل الدخول غير صالحة', 400);
  }

  return payload;
};

const buildAuthorizationUrl = (provider, role) => {
  const definition = getProvider(provider);
  const { clientId, redirectUri } = definition.credentials();

  if (!isConfigured(provider)) {
    throw createError(`تسجيل الدخول عبر ${definition.name} غير مُفعّل`, 503);
  }

  const safeRole = ALLOWED_ROLES.includes(role) ? role : 'client';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: definition.scope,
    state: createState(provider, safeRole),
    ...definition.extraAuthParams,
  });

  return `${definition.authorizeUrl}?${params.toString()}`;
};

const exchangeCode = async (provider, code) => {
  const definition = getProvider(provider);
  const { clientId, clientSecret, redirectUri } = definition.credentials();

  const response = await fetch(definition.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok || !data || data.error || !data.access_token) {
    throw createError(`فشل التحقق مع ${definition.name}`, 401);
  }

  return data.access_token;
};

const fetchProfile = async (provider, accessToken) => {
  const definition = getProvider(provider);

  const response = await fetch(definition.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw createError(`تعذر جلب بيانات الحساب من ${definition.name}`, 401);
  }

  const profile = await response.json();

  if (!profile.sub || !profile.email) {
    throw createError('تعذر الحصول على البريد الإلكتروني من مزوّد الدخول', 400);
  }

  return {
    providerId: String(profile.sub),
    email: profile.email,
    emailVerified: profile.email_verified !== false,
    fullName:
      profile.name ||
      [profile.given_name, profile.family_name].filter(Boolean).join(' ') ||
      profile.email,
    avatarUrl: profile.picture || null,
  };
};

const getRoleId = async (role) => {
  const safeRole = ALLOWED_ROLES.includes(role) ? role : 'client';
  const result = await db.query('SELECT id FROM roles WHERE name = $1', [safeRole]);

  if (result.rows.length === 0) {
    throw createError('نوع الحساب غير موجود', 400);
  }

  return { roleId: result.rows[0].id, role: safeRole };
};

const findOAuthAccount = async (provider, providerId) => {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.is_email_verified,
            r.name AS role
     FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE oa.provider = $1 AND oa.provider_id = $2`,
    [provider, providerId]
  );

  return result.rows[0] || null;
};

const findUserByEmail = async (email) => {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.is_email_verified,
            r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email]
  );

  return result.rows[0] || null;
};

const linkAccount = async (userId, provider, profile) => {
  await db.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [userId, provider, profile.providerId, profile.email]
  );
};

const createOAuthUser = async ({ email, fullName, role }) => {
  const { roleId, role: safeRole } = await getRoleId(role);
  const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

  const result = await db.query(
    `INSERT INTO users (full_name, email, password, role_id, is_email_verified)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, full_name, email, phone, is_email_verified`,
    [fullName, email, randomPassword, roleId]
  );

  return { ...result.rows[0], role: safeRole, is_active: true };
};

const issueToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

const handleCallback = async ({ provider, code, state }) => {
  getProvider(provider);

  if (!code) {
    throw createError('كود التحقق مفقود', 400);
  }

  const statePayload = verifyState(provider, state);
  const accessToken = await exchangeCode(provider, code);
  const profile = await fetchProfile(provider, accessToken);

  let user = await findOAuthAccount(provider, profile.providerId);
  let isNew = false;

  if (!user) {
    user = await findUserByEmail(profile.email);

    if (user) {
      await linkAccount(user.id, provider, profile);

      if (!user.is_email_verified && profile.emailVerified) {
        await db.query(
          'UPDATE users SET is_email_verified = true, updated_at = NOW() WHERE id = $1',
          [user.id]
        );
        user.is_email_verified = true;
      }
    } else {
      user = await createOAuthUser({
        email: profile.email,
        fullName: profile.fullName,
        role: statePayload.role,
      });
      await linkAccount(user.id, provider, profile);
      isNew = true;
    }
  }

  if (!user.is_active) {
    throw createError('هذا الحساب موقوف', 403);
  }

  return {
    token: issueToken(user),
    isNew,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  };
};

module.exports = {
  isConfigured,
  buildAuthorizationUrl,
  handleCallback,
};
