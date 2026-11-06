const profileService = require('./profile.service');

const getProfile = async (req, res) => {
  try {
    const data = await profileService.getProfile(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب الملف الشخصي',
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const data = await profileService.updateProfile(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات ملفك الشخصي بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث الملف الشخصي',
    });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const data = await profileService.deleteAvatar(req.user.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء حذف الصورة الشخصية',
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const data = await profileService.changePassword(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تغيير كلمة المرور',
    });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const data = await profileService.updatePreferences(req.user.id, req.body || {});
    return res.status(200).json({
      success: true,
      message: 'تم تحديث تفضيلات الحساب بنجاح',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تحديث التفضيلات',
    });
  }
};

// ---------------- 2FA Handlers ----------------
const generate2FASetup = async (req, res) => {
  try {
    const data = await profileService.generate2FASetup(req.user.id);
    return res.status(200).json({
      success: true,
      message: 'تم توليد مفتاح الإعداد ورمز الاستجابة السريعة للمصادقة الثنائية',
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إعداد المصادقة الثنائية',
    });
  }
};

const verifyAndEnable2FA = async (req, res) => {
  try {
    const data = await profileService.verifyAndEnable2FA(req.user.id, req.body || {});
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تفعيل المصادقة الثنائية',
    });
  }
};

const disable2FA = async (req, res) => {
  try {
    const data = await profileService.disable2FA(req.user.id, req.body || {});
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تعطيل المصادقة الثنائية',
    });
  }
};

const regenerateBackupCodes = async (req, res) => {
  try {
    const data = await profileService.regenerateBackupCodes(req.user.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إعادة توليد رموز الاسترداد',
    });
  }
};

// ---------------- Sessions Handlers ----------------
const getUserSessions = async (req, res) => {
  try {
    const data = await profileService.getUserSessions(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب قائمة الجلسات النشطة',
    });
  }
};

const revokeSession = async (req, res) => {
  try {
    const data = await profileService.revokeSession(req.user.id, req.params.sessionId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء إنهاء الجلسة',
    });
  }
};

const revokeAllOtherSessions = async (req, res) => {
  try {
    const data = await profileService.revokeAllOtherSessions(req.user.id);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تسجيل الخروج من الأجهزة الأخرى',
    });
  }
};

// ---------------- Verification (KYC) Handlers ----------------
const getVerificationDetails = async (req, res) => {
  try {
    const data = await profileService.getVerificationDetails(req.user.id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء جلب تفاصيل التوثيق',
    });
  }
};

const requestVerificationUpdate = async (req, res) => {
  try {
    const data = await profileService.requestVerificationUpdate(req.user.id, req.body || {});
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء تقديم طلب تحديث التوثيق',
    });
  }
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
