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

// محدد عام لجميع طلبات الـ API لحماية السيرفر من هجمات الإغراق (DoS / Brute-force)
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  limit: 300, // حد أقصى 300 طلب لكل IP
  message: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة بعد قليل',
});

// محدد خاص بعمليات تسجيل الدخول والحسابات
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

// محدد خاص بطلب إعادة تعيين كلمة المرور
const passwordResetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

// محدد خاص بطلب روابط تفعيل البريد
const emailVerificationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'محاولات كثيرة، يرجى المحاولة بعد 15 دقيقة',
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
};
