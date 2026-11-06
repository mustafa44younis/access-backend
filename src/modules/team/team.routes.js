const express = require('express');
const router = express.Router();
const teamController = require('./team.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.use(protect);

// 1. جلب أعضاء الفريق النشطين في مشاريع العميل الحالية
router.get('/my-team', teamController.getMyProjectTeam);

// 2. تصفح والبحث في المستقلين وقادة الفرق بالمنصة
router.get('/specialists', teamController.getSpecialists);

// 3. جلب تفاصيل مستقل محدد ومعرض مهاراته
router.get('/specialists/:id', teamController.getSpecialistById);

module.exports = router;
