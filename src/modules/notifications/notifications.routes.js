const express = require('express');
const router = express.Router();
const notificationsController = require('./notifications.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.use(protect);

// 1. جلب قائمة إشعارات المستخدم
router.get('/', notificationsController.getNotifications);

// 2. تعليم جميع الإشعارات كمقروءة
router.put('/read-all', notificationsController.markAllAsRead);

// 3. تعليم إشعار محدد كمقروء
router.put('/:id/read', notificationsController.markAsRead);

module.exports = router;

