const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const config = require('../../config');
const crypto = require('crypto');

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

  // إنشاء المستخدم
  const result = await db.query(
    `INSERT INTO users (full_name, email, phone, password, role_id)
     VALUES ($1, $2, $3, $4, $5)
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

const login = async ({ email, password }) => {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.password, u.is_active, r.name as role
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

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    error.statusCode = 401;
    throw error;
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

  // إنشاء توكن عشوائي
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 دقيقة

  // حفظ التوكن
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, resetToken, expiresAt]
  );

  // ملاحظة: في المرحلة الحالية منرجع التوكن في الـ response عشان نختبر
  // لاحقاً راح نبعت إيميل حقيقي
  return {
    message: 'تم إنشاء رابط إعادة التعيين',
    resetToken, // مؤقت للتجربة فقط
    expiresIn: '15 minutes',
  };
};

const resetPassword = async ({ token, newPassword }) => {
  const result = await db.query(
    `SELECT * FROM password_reset_tokens 
     WHERE token = $1 AND used = false AND expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) {
    const error = new Error('رابط إعادة التعيين غير صالح أو منتهي الصلاحية');
    error.statusCode = 400;
    throw error;
  }

  const resetRecord = result.rows[0];

  // تشفير كلمة المرور الجديدة
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // تحديث كلمة المرور
  await db.query(
    'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
    [hashedPassword, resetRecord.user_id]
  );

  // تعليم التوكن كمستخدم
  await db.query(
    'UPDATE password_reset_tokens SET used = true WHERE id = $1',
    [resetRecord.id]
  );

  return { message: 'تم تغيير كلمة المرور بنجاح' };
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
};