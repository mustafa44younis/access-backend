const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const oauthController = require('./oauth.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
} = require('../../shared/middleware/rate-limit.middleware');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);
router.get('/verify-email', emailVerificationLimiter, authController.verifyEmail);
router.post('/verify-email', emailVerificationLimiter, authController.verifyEmail);
router.post('/resend-verification', emailVerificationLimiter, authController.resendVerification);

router.get('/google', authLimiter, oauthController.google);
router.get('/google/callback', oauthController.googleCallback);
router.get('/linkedin', authLimiter, oauthController.linkedin);
router.get('/linkedin/callback', oauthController.linkedinCallback);

// Routes محمية
router.get('/me', protect, authController.getMe);

module.exports = router;