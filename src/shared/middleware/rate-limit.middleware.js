const { rateLimit } = require('express-rate-limit');

const createLimiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

const passwordResetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

const emailVerificationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
};
