const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const config = require('../../config');
const crypto = require('crypto');
const emailService = require('../../shared/services/email.service');
const twoFactorUtil = require('../../shared/utils/two-factor.util');

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const createEmailVerificationToken = async (userId) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ساعة

  await db.query(
    'DELETE FROM email_verification_tokens WHERE user_id = $1 AND used = false',
    [userId]
  );

  await db.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashedToken, expiresAt]
  );

  return rawToken;
};

const register = async ({ full_name, email, phone, password, role }) => {
  // التحقق إذا الإيميل موجود مسبقاً
  const existingUser = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    const error = new Error('البريد الإلكتروني مستخدم بالفعل');
    error.statusCode = 409;
    throw error;
  }

  // جلب role_id
  const roleResult = await db.query(
    'SELECT id FROM roles WHERE name = $1',
    [role]
  );

  if (roleResult.rows.length === 0) {
    const error = new Error('نوع الحساب غير موجود');
    error.statusCode = 400;
    throw error;
  }

  const roleId = roleResult.rows[0].id;

  // تشفير كلمة المرور
  const hashedPassword = await bcrypt.hash(password, 12);

  // إنشاء المستخدم (مفعّل ومؤكد تلقائياً للتسجيل السريع)
  const result = await db.query(
    `INSERT INTO users (full_name, email, phone, password, role_id, is_email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, full_name, email, phone, role_id, created_at`,
    [full_name, email, phone || null, hashedPassword, roleId]
  );

  const user = result.rows[0];

  // إنشاء التوكن
  const token = jwt.sign(
    { userId: user.id, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role,
      created_at: user.created_at,
    },
    token,
  };
};

const login = async ({ email, password, twoFactorCode }, meta = {}) => {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.password, u.is_active, u.is_email_verified,
            u.two_factor_enabled, u.two_factor_secret, u.two_factor_backup_codes, r.name as role, u.avatar_url
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    const error = new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    error.statusCode = 401;
    throw error;
  }

  const user = result.rows[0];

  if (!user.is_active) {
    const error = new Error('هذا الحساب موقوف');
    error.statusCode = 403;
    throw error;
  }

  if (!user.is_email_verified) {
    // تفعيل البريد تلقائياً لتسجيل الدخول السريع دون انتظار
    db.query('UPDATE users SET is_email_verified = true WHERE id = $1', [user.id]).catch(() => {});
    user.is_email_verified = true;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    error.statusCode = 401;
    throw error;
  }

  // التحقق من المصادقة الثنائية (2FA) إذا كانت مفعلة
  if (user.two_factor_enabled) {
    if (!twoFactorCode || twoFactorCode.trim() === '') {
      return {
        requires_2fa: true,
        message: 'المصادقة الثنائية مفعلة. يرجى إدخال رمز التحقق (OTP) أو رمز الاسترداد لإتمام الدخول',
      };
    }

    const cleanCode = twoFactorCode.trim().toUpperCase();
    const backupCodes = user.two_factor_backup_codes || [];

    // التحقق من رمز TOTP الحقيقي
    const isOtpValid = twoFactorUtil.verifyOtpCode(user.two_factor_secret || '', twoFactorCode.trim());

    // التحقق من رمز الاسترداد
    const backupResult = twoFactorUtil.verifyBackupCode(backupCodes, cleanCode);

    if (!isOtpValid && !backupResult.valid) {
      const error = new Error('رمز التحقق الثنائي أو رمز الاسترداد غير صحيح');
      error.statusCode = 401;
      throw error;
    }

    // إذا تم استخدام رمز استرداد -> استهلاكه لمرة واحدة فقط
    if (backupResult.valid) {
      const updatedCodes = backupCodes.filter((_, i) => i !== backupResult.usedIndex);
      await db.query(
        'UPDATE users SET two_factor_backup_codes = $1::jsonb WHERE id = $2',
        [JSON.stringify(updatedCodes), user.id]
      );
    }
  }

  // تسجيل جلسة نشطة للمستخدم
  try {
    const deviceName = meta.userAgent && meta.userAgent.includes('Mobile') ? 'هاتف جوال - تطبيق ACCESS' : 'جهاز كمبيوتر - متصفح الويب';
    const location = 'المملكة العربية السعودية';
    await db.query(
      `INSERT INTO user_sessions (user_id, device_name, ip_address, location, is_current, last_active_at)
       VALUES ($1, $2, $3, $4, true, NOW())`,
      [user.id, deviceName, meta.ip || '127.0.0.1', location]
    );
  } catch (sessErr) {
    // عدم تعطيل تسجيل الدخول في حال فشل تسجيل الجلسة
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar_url: user.avatar_url || null,
    },
    token,
  };
};


const forgotPassword = async (email) => {
  const result = await db.query(
    'SELECT id, full_name, email FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    // لأسباب أمنية منرجعش رسالة إن الإيميل مش موجود
    return { message: 'إذا كان البريد مسجلاً، سيتم إرسال رابط إعادة التعيين' };
  }

  const user = result.rows[0];

  // إنشاء توكن عشوائي وتشفيره للتخزين في قاعدة البيانات
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(resetToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 دقيقة

  // حذف أي توكنات سابقة غير مستخدمة
  await db.query(
    'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = false',
    [user.id]
  );

  // حفظ التوكن مشفراً
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashedToken, expiresAt]
  );

  await emailService.sendPasswordResetEmail({
    to: user.email,
    fullName: user.full_name,
    token: resetToken,
  });

  return {
    message: 'إذا كان البريد مسجلاً، سيتم إرسال رابط إعادة التعيين',
  };
};

const resetPassword = async ({ token, newPassword }) => {
  const hashedToken = hashToken(token);
  const result = await db.query(
    `SELECT * FROM password_reset_tokens 
     WHERE (token = $1 OR token = $2) AND used = false AND expires_at > NOW()`,
    [hashedToken, token]
  );

  if (result.rows.length === 0) {
    const error = new Error('رابط إعادة التعيين غير صالح أو منتهي الصلاحية');
    error.statusCode = 400;
    throw error;
  }

  const resetRecord = result.rows[0];

  // تشفير كلمة المرور الجديدة
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // تحديث كلمة المرور وتعليم التوكن كمستخدم داخل Transaction
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, resetRecord.user_id]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used = true WHERE id = $1',
      [resetRecord.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { message: 'تم تغيير كلمة المرور بنجاح' };
};

const verifyEmail = async ({ token }) => {
  const hashedToken = hashToken(token);
  const result = await db.query(
    `SELECT id, user_id FROM email_verification_tokens
     WHERE (token = $1 OR token = $2) AND used = false AND expires_at > NOW()`,
    [hashedToken, token]
  );

  if (result.rows.length === 0) {
    const error = new Error('رابط التفعيل غير صالح أو منتهي الصلاحية');
    error.statusCode = 400;
    throw error;
  }

  const record = result.rows[0];

  // تحديث حالة التفعيل وتعليم التوكن كمستخدم داخل Transaction
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET is_email_verified = true, updated_at = NOW() WHERE id = $1',
      [record.user_id]
    );
    await client.query(
      'UPDATE email_verification_tokens SET used = true WHERE id = $1',
      [record.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { message: 'تم تفعيل بريدك الإلكتروني بنجاح' };
};

const resendVerification = async (email) => {
  const result = await db.query(
    'SELECT id, full_name, email, is_email_verified FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    return { message: 'إذا كان البريد مسجلاً، سيتم إرسال رابط التفعيل' };
  }

  const user = result.rows[0];

  if (user.is_email_verified) {
    return { message: 'بريدك الإلكتروني مفعّل بالفعل' };
  }

  const token = await createEmailVerificationToken(user.id);

  await emailService.sendVerificationEmail({
    to: user.email,
    fullName: user.full_name,
    token,
  });

  return { message: 'إذا كان البريد مسجلاً، سيتم إرسال رابط التفعيل' };
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
};