require('dotenv').config();

const port = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

module.exports = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:
      process.env.DB_SSL === 'true' ||
      (Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) ||
      (Boolean(process.env.DB_HOST) && !['localhost', '127.0.0.1'].includes(process.env.DB_HOST)),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  app: {
    frontendUrl,
    backendUrl,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'ACCESS <no-reply@access.sa>',
  },
  oauth: {
    successRedirect: process.env.OAUTH_SUCCESS_REDIRECT || `${frontendUrl}/auth/callback`,
    failureRedirect: process.env.OAUTH_FAILURE_REDIRECT || `${frontendUrl}/login`,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ||
        `${backendUrl}/api/auth/google/callback`,
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      redirectUri:
        process.env.LINKEDIN_REDIRECT_URI ||
        `${backendUrl}/api/auth/linkedin/callback`,
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};
