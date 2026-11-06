const express = require('express');
const router = express.Router();
const uploadController = require('./upload.controller');
const upload = require('../../shared/middleware/upload.middleware');
const { protect } = require('../../shared/middleware/auth.middleware');

// حماية مسارات الرفع
router.use(protect);

// 1. رفع ملف عام (مستند، صورة، تسجيل صوتي)
router.post('/', upload.single('file'), uploadController.uploadSingleFile);

// 2. رفع صورة شخصية وتحديث الحساب
router.post('/avatar', upload.single('avatar'), uploadController.uploadAvatar);

module.exports = router;

