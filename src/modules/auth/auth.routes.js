const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { protect } = require('../../shared/middleware/auth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Routes محمية
router.get('/me', protect, authController.getMe);

module.exports = router;