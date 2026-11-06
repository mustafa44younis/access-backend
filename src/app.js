const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const { apiLimiter } = require('./shared/middleware/rate-limit.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const milestonesRoutes = require('./modules/milestones/milestones.routes');
const contractsRoutes = require('./modules/contracts/contracts.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const messagesRoutes = require('./modules/messages/messages.routes');
const profileRoutes = require('./modules/profile/profile.routes');
const teamRoutes = require('./modules/team/team.routes');
const uploadRoutes = require('./modules/upload/upload.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');

const app = express();

// إعدادات أمان الترويسات (Helmet)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// تقييد CORS بدقة لمنع الهجمات الموجهة من مواقع أخرى
app.use(
  cors({
    origin: config.nodeEnv === 'production' ? config.app.frontendUrl : true,
    credentials: true,
  })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات المرفوعة كملفات ثابتة
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ACCESS Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// تطبيق حماية معدل الطلبات (Rate Limiting) على جميع مسارات /api
app.use('/api', apiLimiter);

// Application routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/milestones', milestonesRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'المسار غير موجود',
  });
});

// Global error handler - منع تسريب تفاصيل الأخطاء والـ Stack Trace في بيئة الإنتاج
app.use((err, req, res, next) => {
  console.error('❌', err);

  res.status(err.statusCode || 500).json({
    success: false,
    message:
      config.nodeEnv === 'production'
        ? 'حدث خطأ في السيرفر'
        : err.message || 'حدث خطأ في السيرفر',
  });
});

module.exports = app;
