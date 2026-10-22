require('dotenv').config();

const port = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

module.exports = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
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
};
