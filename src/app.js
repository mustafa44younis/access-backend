const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const authRoutes = require('./modules/auth/auth.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const milestonesRoutes = require('./modules/milestones/milestones.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ACCESS Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// Application routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/milestones', milestonesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'المسار غير موجود',
  });
});

// Global error handler
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