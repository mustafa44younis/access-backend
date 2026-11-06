const express = require('express');
const router = express.Router();
const messagesController = require('./messages.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

// حماية جميع مسارات الرسائل
router.use(protect);

// 1. جلب قائمة المحادثات للمستخدم
router.get('/conversations', messagesController.getUserConversations);

// 2. جلب أو إنشاء قناة محادثة مشروع محدد
router.post('/conversations/project/:projectId', messagesController.getOrCreateProjectConversation);

// 3. جلب تفاصيل محادثة محددة
router.get('/conversations/:id', messagesController.getConversationDetails);

// 4. جلب سياق المشروع المرتبط بالمحادثة (الشريط الجانبي)
router.get('/conversations/:id/context', messagesController.getConversationProjectContext);

// 5. البحث في رسائل المحادثة (شريط البحث داخل المحادثة)
router.get('/conversations/:id/search', messagesController.searchConversationMessages);

// 6. جلب حالة تواجد واتصال المشاركين
router.get('/conversations/:id/presence', messagesController.getConversationPresence);

// 7. جلب سجل رسائل المحادثة
router.get('/conversations/:id/messages', messagesController.getConversationMessages);

// 8. إرسال رسالة جديدة (نص، صوت، مرفقات)
router.post('/conversations/:id/messages', messagesController.sendMessage);

// 9. إعادة إرسال رسالة متعثرة
router.post('/conversations/:id/messages/:messageId/retry', messagesController.retryFailedMessage);

// 10. طلب تدخل إدارة المنصة لفض نزاع في المحادثة
router.post('/conversations/:id/intervention', messagesController.requestChatIntervention);

// 11. تعليم رسائل المحادثة كمقروءة
router.post('/conversations/:id/read', messagesController.markConversationAsRead);

// 12. مستودع الملفات والمستندات المشتركة للمشروع
router.get('/projects/:projectId/shared-files', messagesController.getProjectSharedFiles);
router.post('/projects/:projectId/shared-files', messagesController.uploadProjectSharedFile);

// 13. معاينة الملف / الصورة (Lightbox)
router.get('/files/:fileId/preview', messagesController.getFilePreviewDetails);

module.exports = router;
