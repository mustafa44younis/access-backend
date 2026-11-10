const http = require('http');
const app = require('./app');
const config = require('./config');
const db = require('./config/db');
const { initSocket } = require('./socket');

const PORT = config.port;

const startServer = async () => {
  try {
    // اختبار الاتصال بقاعدة البيانات
    await db.query('SELECT NOW()');
    console.log('✅ Database connection tested successfully');

    // إنشاء HTTP Server من Express app
    const httpServer = http.createServer(app);

    // تهيئة Socket.io
    initSocket(httpServer);

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 ACCESS Backend running on http://0.0.0.0:${PORT}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`⚡ WebSocket (Socket.io) is active on ws://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
