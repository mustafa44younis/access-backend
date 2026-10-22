const app = require('./app');

const config = require('./config');
const db = require('./config/db');

const PORT = config.port;

const startServer = async () => {
  try {
    // اختبار الاتصال
    await db.query('SELECT NOW()');
    console.log('✅ Database connection tested successfully');

    app.listen(PORT, () => {
      console.log(`🚀 ACCESS Backend running on http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();