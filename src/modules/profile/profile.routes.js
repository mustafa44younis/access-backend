const express = require('express');
const router = express.Router();
const profileController = require('./profile.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

// حماية جميع مسارات الملف الشخصي
router.use(protect);

// 1. جلب الملف الشخصي والإحصائيات وتفاصيل الأمان
router.get('/', profileController.getProfile);

// 2. تحديث البيانات الشخصية والمعلومات العامة
router.put('/', profileController.updateProfile);

// 3. حذف الصورة الشخصية واسترجاع الأحرف الأولى (Initials)
router.delete('/avatar', profileController.deleteAvatar);

// 4. تغيير كلمة المرور
router.put('/change-password', profileController.changePassword);

// 5. تحديث تفضيلات الإشعارات والمظهر
router.put('/preferences', profileController.updatePreferences);

// 6. المصادقة الثنائية (2FA)
router.post('/2fa/generate', profileController.generate2FASetup);
router.post('/2fa/verify', profileController.verifyAndEnable2FA);
router.post('/2fa/disable', profileController.disable2FA);
router.post('/2fa/regenerate-backup-codes', profileController.regenerateBackupCodes);

// 7. إدارة الأجهزة والجلسات النشطة
router.get('/sessions', profileController.getUserSessions);
router.delete('/sessions/:sessionId', profileController.revokeSession);
router.post('/sessions/revoke-others', profileController.revokeAllOtherSessions);

// 8. التوثيق والاعتماد الرسمي (KYC)
router.get('/verification', profileController.getVerificationDetails);
router.post('/verification/request', profileController.requestVerificationUpdate);

module.exports = router;
