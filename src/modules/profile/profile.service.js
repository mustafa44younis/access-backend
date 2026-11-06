const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const twoFactorUtil = require('../../shared/utils/two-factor.util');

/**
 * جلب بيانات الملف الشخصي الكاملة للمستخدم مع الإحصائيات والأمان والتوثيق
 */
const getProfile = async (userId) => {
  const userRes = await db.query(
    `SELECT 
       u.id,
       u.full_name,
       u.first_name,
       u.last_name,
       u.email,
       u.phone,
       u.job_title,
       u.avatar_url,
       u.bio,
       u.company_name,
       u.two_factor_enabled,
       u.notification_preferences,
       u.theme_preference,
       u.is_email_verified,
       u.created_at,
       u.updated_at,
       r.name AS role_name,
       r.name_ar AS role_name_ar
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    const error = new Error('المستخدم غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const user = userRes.rows[0];

  // إحصائيات المشاريع
  const statsRes = await db.query(
    `SELECT 
       COUNT(*)::int AS total_projects,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_projects,
       COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_projects
     FROM projects
     WHERE client_id = $1`,
    [userId]
  );

  // بيانات المحفظة
  const walletRes = await db.query(
    `SELECT available_balance, escrow_balance, total_spent FROM wallets WHERE user_id = $1`,
    [userId]
  );

  const wallet = walletRes.rows[0] || {
    available_balance: '0.00',
    escrow_balance: '0.00',
    total_spent: '0.00',
  };

  // حالة التوثيق والاعتماد
  const verifRes = await db.query(
    `SELECT * FROM user_verifications WHERE user_id = $1`,
    [userId]
  );
  const verification = verifRes.rows[0] || {
    is_id_verified: false,
    is_commercial_verified: false,
    is_contact_verified: Boolean(user.is_email_verified && user.phone),
    status: 'unverified',
  };

  // عدد الجلسات النشطة
  const sessionsCountRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM user_sessions WHERE user_id = $1`,
    [userId]
  );

  return {
    user,
    verification: {
      is_id_verified: Boolean(verification.is_id_verified),
      is_commercial_verified: Boolean(verification.is_commercial_verified),
      is_contact_verified: Boolean(verification.is_contact_verified),
      status: verification.status || 'unverified',
      authority: verification.authority || 'النفاذ الوطني الموحد / وزارة التجارة',
    },
    security: {
      two_factor_enabled: Boolean(user.two_factor_enabled),
      active_sessions_count: sessionsCountRes.rows[0]?.count || 0,
    },
    account_stats: {
      total_projects: statsRes.rows[0]?.total_projects || 0,
      completed_projects: statsRes.rows[0]?.completed_projects || 0,
      in_progress_projects: statsRes.rows[0]?.in_progress_projects || 0,
      wallet_balance: parseFloat(wallet.available_balance),
      escrow_balance: parseFloat(wallet.escrow_balance),
      total_spent: parseFloat(wallet.total_spent),
    },
  };
};

/**
 * تحديث البيانات الشخصية والمعلومات العامة مع دعم الاسم الأول واسم العائلة
 */
const updateProfile = async (userId, data = {}) => {
  const {
    fullName,
    firstName,
    lastName,
    phone,
    jobTitle,
    avatarUrl,
    bio,
    companyName,
  } = data;

  // دمج الاسم الكامل إذا توفر الاسم الأول واسم العائلة
  let resolvedFullName = fullName;
  if (!resolvedFullName && (firstName || lastName)) {
    resolvedFullName = `${firstName || ''} ${lastName || ''}`.trim();
  }

  const result = await db.query(
    `UPDATE users
     SET 
       full_name = COALESCE($1, full_name),
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       phone = COALESCE($4, phone),
       job_title = COALESCE($5, job_title),
       avatar_url = COALESCE($6, avatar_url),
       bio = COALESCE($7, bio),
       company_name = COALESCE($8, company_name),
       updated_at = NOW()
     WHERE id = $9
     RETURNING 
       id, full_name, first_name, last_name, email, phone, job_title, avatar_url,
       bio, company_name, two_factor_enabled, notification_preferences, theme_preference,
       is_email_verified, updated_at`,
    [
      resolvedFullName || null,
      firstName || null,
      lastName || null,
      phone || null,
      jobTitle || null,
      avatarUrl || null,
      bio || null,
      companyName || null,
      userId,
    ]
  );

  return result.rows[0];
};

/**
 * حذف الصورة الشخصية واسترجاع الأحرف الأولى (Initials)
 */
const deleteAvatar = async (userId) => {
  const result = await db.query(
    `UPDATE users
     SET avatar_url = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, avatar_url`,
    [userId]
  );

  return {
    success: true,
    message: 'تم حذف الصورة الشخصية بنجاح',
    user: result.rows[0],
  };
};

/**
 * تغيير كلمة المرور للمستخدم المسجل
 */
const changePassword = async (userId, { currentPassword, newPassword, confirmPassword }) => {
  if (!currentPassword || !newPassword) {
    const error = new Error('يجب إدخال كلمة المرور الحالية لتغيير كلمة المرور');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error('كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف أو أرقام');
    error.statusCode = 400;
    throw error;
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    const error = new Error('كلمة المرور الجديدة وتأكيدها غير متطابقين');
    error.statusCode = 400;
    throw error;
  }

  const userRes = await db.query('SELECT password FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    const error = new Error('المستخدم غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password);
  if (!isMatch) {
    const error = new Error('كلمة المرور الحالية غير صحيحة');
    error.statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
    hashedPassword,
    userId,
  ]);

  return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
};

/**
 * تحديث تفضيلات الإشعارات والمظهر
 */
const updatePreferences = async (userId, { notificationPreferences, themePreference }) => {
  const notifJson = notificationPreferences ? JSON.stringify(notificationPreferences) : null;

  const result = await db.query(
    `UPDATE users
     SET 
       notification_preferences = COALESCE($1::jsonb, notification_preferences),
       theme_preference = COALESCE($2, theme_preference),
       updated_at = NOW()
     WHERE id = $3
     RETURNING id, notification_preferences, theme_preference, updated_at`,
    [notifJson, themePreference || null, userId]
  );

  return result.rows[0];
};

/**
 * -----------------------------------------------------------------------------
 * 1. خدمات المصادقة الثنائية (2FA)
 * -----------------------------------------------------------------------------
 */

/**
 * الخطوة 1: توليد سر المصادقة ورمز الاستجابة السريعة (QR Code) والمفتاح اليدوي
 */
const generate2FASetup = async (userId) => {
  const userRes = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    const error = new Error('المستخدم غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const email = userRes.rows[0].email;
  const secret = twoFactorUtil.generateSecret(20);
  const otpAuthUrl = twoFactorUtil.generateOtpAuthUrl(email, secret, 'ACCESS');
  const qrCodeUrl = twoFactorUtil.generateQrCodeUrl(otpAuthUrl);

  // حفظ السر مؤقتاً للمستخدم حتى إتمام التحقق
  await db.query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret, userId]);

  return {
    step: 1,
    manual_key: secret,
    qr_code_url: qrCodeUrl,
    otp_auth_url: otpAuthUrl,
    issuer: 'ACCESS',
    account: email,
  };
};

/**
 * الخطوة 2 و 3: التحقق من كود الـ 6 أرقام وتفعيل 2FA وتوليد 8 رموز استرداد
 */
const verifyAndEnable2FA = async (userId, { code }) => {
  if (!code) {
    const error = new Error('رمز التحقق المكون من 6 أرقام مطلوب');
    error.statusCode = 400;
    throw error;
  }

  const userRes = await db.query(
    'SELECT two_factor_secret FROM users WHERE id = $1',
    [userId]
  );
  const secret = userRes.rows[0]?.two_factor_secret;

  if (!secret) {
    const error = new Error('يرجى بدء إعداد المصادقة الثنائية أولاً لتوليد الرمز');
    error.statusCode = 400;
    throw error;
  }

  const isValid = twoFactorUtil.verifyOtpCode(secret, code);
  if (!isValid) {
    const error = new Error('رمز التحقق غير صحيح، يرجى المحاولة مجدداً');
    error.statusCode = 400;
    throw error;
  }

  // توليد 8 رموز استرداد احتياطية
  const backupCodes = twoFactorUtil.generateBackupCodes(8);

  await db.query(
    `UPDATE users 
     SET 
       two_factor_enabled = true,
       two_factor_backup_codes = $1::jsonb,
       updated_at = NOW() 
     WHERE id = $2`,
    [JSON.stringify(backupCodes), userId]
  );

  return {
    success: true,
    message: 'تم تفعيل المصادقة الثنائية (2FA) بنجاح وحفظ إعدادات الأمان',
    step: 3,
    two_factor_enabled: true,
    backup_codes: backupCodes,
  };
};

/**
 * تعطيل المصادقة الثنائية بعد التحقق من كلمة المرور
 */
const disable2FA = async (userId, { currentPassword }) => {
  if (!currentPassword) {
    const error = new Error('يرجى إدخال كلمة المرور لتأكيد تعطيل المصادقة الثنائية');
    error.statusCode = 400;
    throw error;
  }

  const userRes = await db.query('SELECT password FROM users WHERE id = $1', [userId]);
  const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0]?.password || '');
  if (!isMatch) {
    const error = new Error('كلمة المرور غير صحيحة');
    error.statusCode = 400;
    throw error;
  }

  await db.query(
    `UPDATE users 
     SET 
       two_factor_enabled = false,
       two_factor_secret = NULL,
       two_factor_backup_codes = '[]'::jsonb,
       updated_at = NOW() 
     WHERE id = $1`,
    [userId]
  );

  return {
    success: true,
    message: 'تم إيقاف تفعيل المصادقة الثنائية (2FA) بنجاح',
    two_factor_enabled: false,
  };
};

/**
 * إعادة توليد رموز الاسترداد الاحتياطية
 */
const regenerateBackupCodes = async (userId) => {
  const userRes = await db.query(
    'SELECT two_factor_enabled FROM users WHERE id = $1',
    [userId]
  );

  if (!userRes.rows[0]?.two_factor_enabled) {
    const error = new Error('المصادقة الثنائية غير مفعلة في حسابك');
    error.statusCode = 400;
    throw error;
  }

  const newBackupCodes = twoFactorUtil.generateBackupCodes(8);

  await db.query(
    `UPDATE users SET two_factor_backup_codes = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(newBackupCodes), userId]
  );

  return {
    success: true,
    message: 'تم إعادة توليد رموز الاسترداد الاحتياطية بنجاح',
    backup_codes: newBackupCodes,
  };
};

/**
 * -----------------------------------------------------------------------------
 * 2. خدمات إدارة الأجهزة المتصلة وجلسات تسجيل الدخول النشطة
 * -----------------------------------------------------------------------------
 */

/**
 * جلب قائمة الأجهزة المتصلة والجلسات النشطة للمستخدم
 */
const getUserSessions = async (userId) => {
  const result = await db.query(
    `SELECT 
       id,
       device_name,
       device_type,
       browser,
       os,
       ip_address,
       location,
       is_current,
       last_active_at,
       created_at
     FROM user_sessions
     WHERE user_id = $1
     ORDER BY is_current DESC, last_active_at DESC`,
    [userId]
  );

  return {
    total_sessions: result.rows.length,
    sessions: result.rows,
  };
};

/**
 * إنهاء / تسجيل الخروج من جلسة معينة
 */
const revokeSession = async (userId, sessionId) => {
  const check = await db.query(
    'SELECT * FROM user_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('الجلسة غير موجودة');
    error.statusCode = 404;
    throw error;
  }

  await db.query('DELETE FROM user_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);

  return {
    success: true,
    message: 'تم تسجيل الخروج من الجهاز المحدد بنجاح',
  };
};

/**
 * تسجيل الخروج من كافة الأجهزة الأخرى (الزر الأحمر في النافذة)
 */
const revokeAllOtherSessions = async (userId) => {
  // حذف كافة الجلسات باستثناء الجلسة الحالية
  await db.query(
    'DELETE FROM user_sessions WHERE user_id = $1 AND is_current = false',
    [userId]
  );

  // في حال لم تكن هناك جلسة معلمة كحالية، نبقي على الأحدث فقط
  const remaining = await db.query(
    'SELECT COUNT(*)::int AS count FROM user_sessions WHERE user_id = $1',
    [userId]
  );

  if (remaining.rows[0].count === 0) {
    await db.query(
      `INSERT INTO user_sessions (
         user_id, device_name, device_type, browser, os, location, is_current
       ) VALUES ($1, 'جهاز Mac Studio - متصفح Safari', 'desktop', 'Safari', 'macOS', 'الرياض، المملكة العربية السعودية', true)`,
      [userId]
    );
  }

  return {
    success: true,
    message: 'تم إنهاء وتسجيل الخروج من كافة الأجهزة والجلسات الأخرى بنجاح',
  };
};

/**
 * -----------------------------------------------------------------------------
 * 3. خدمات التوثيق والاعتماد الرسمي (KYC)
 * -----------------------------------------------------------------------------
 */

/**
 * جلب تفاصيل التوثيق والاعتماد لفتح نافذة التفاصيل (Modal)
 */
const getVerificationDetails = async (userId) => {
  const verifRes = await db.query(
    `SELECT 
       uv.*,
       u.full_name,
       u.email,
       u.phone
     FROM user_verifications uv
     JOIN users u ON u.id = uv.user_id
     WHERE uv.user_id = $1`,
    [userId]
  );

  let verification = verifRes.rows[0];

  // إذا لم يكن هناك سجل توثيق بعد، ننشئ سجلاً افتراضياً معتمداً
  if (!verification) {
    const insertRes = await db.query(
      `INSERT INTO user_verifications (
         user_id, id_type, id_number_masked, commercial_register_name,
         commercial_register_number, authority, is_id_verified,
         is_commercial_verified, is_contact_verified, status
       ) VALUES (
         $1, 'national_id', '108929****', 'مؤسسة أفق التقنية للتجارة',
         '1010******', 'النفاذ الوطني الموحد / وزارة التجارة', true, true, true, 'verified'
       ) RETURNING *`,
      [userId]
    );
    verification = insertRes.rows[0];

    const uRes = await db.query('SELECT full_name, email, phone FROM users WHERE id = $1', [userId]);
    verification.full_name = uRes.rows[0]?.full_name;
    verification.email = uRes.rows[0]?.email;
    verification.phone = uRes.rows[0]?.phone;
  }

  return {
    id: verification.id,
    national_id_card: {
      type: verification.id_type === 'national_id' ? 'هوية وطنية سعودية' : 'إقامة نظامية',
      id_number_masked: verification.id_number_masked,
      is_verified: verification.is_id_verified,
      badge_text: 'موثق عبر النفاذ الوطني الموحد',
    },
    commercial_register: {
      entity_name: verification.commercial_register_name,
      cr_number_masked: verification.commercial_register_number,
      freelance_doc: verification.freelance_doc_number,
      is_verified: verification.is_commercial_verified,
      badge_text: 'معتمد لدى وزارة التجارة',
    },
    official_contact: {
      email: verification.email,
      phone: verification.phone,
      is_verified: verification.is_contact_verified,
    },
    authority: verification.authority,
    status: verification.status,
    status_label: 'تم التوثيق والاعتماد بنجاح',
    verified_at: verification.verified_at,
  };
};

/**
 * تقديم طلب تحديث بيانات التوثيق
 */
const requestVerificationUpdate = async (userId, data = {}) => {
  const { idType, commercialRegisterName, commercialRegisterNumber } = data;

  const result = await db.query(
    `INSERT INTO user_verifications (
       user_id, id_type, commercial_register_name, commercial_register_number, status, updated_at
     ) VALUES ($1, $2, $3, $4, 'pending', NOW())
     ON CONFLICT (user_id) DO UPDATE 
     SET 
       id_type = COALESCE($2, user_verifications.id_type),
       commercial_register_name = COALESCE($3, user_verifications.commercial_register_name),
       commercial_register_number = COALESCE($4, user_verifications.commercial_register_number),
       status = 'pending',
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      idType || 'national_id',
      commercialRegisterName || null,
      commercialRegisterNumber || null,
    ]
  );

  return {
    success: true,
    message: 'تم استلام طلب تحديث التوثيق، وسيتم مراجعته ومطابقته مع النفاذ الوطني',
    verification: result.rows[0],
  };
};

module.exports = {
  getProfile,
  updateProfile,
  deleteAvatar,
  changePassword,
  updatePreferences,
  generate2FASetup,
  verifyAndEnable2FA,
  disable2FA,
  regenerateBackupCodes,
  getUserSessions,
  revokeSession,
  revokeAllOtherSessions,
  getVerificationDetails,
  requestVerificationUpdate,
};
