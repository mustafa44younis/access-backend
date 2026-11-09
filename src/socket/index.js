const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const registerSocketEvents = require('./events');

let io = null;

/**
 * تهيئة Socket.io وربطه بـ HTTP Server
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.app.frontendUrl || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // مهلة اتصال 60 ثانية
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ---- Middleware: التحقق من JWT قبل الاتصال ----
  io.use(async (socket, next) => {
    try {
      // القبول من query param أو auth header
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('غير مصرح: يرجى تمرير JWT token'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);

      const result = await db.query(
        `SELECT u.id, u.full_name, u.email, u.avatar_url, r.name AS role
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.is_active = true`,
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return next(new Error('المستخدم غير موجود أو الحساب غير مفعّل'));
      }

      // تخزين بيانات المستخدم على الـ socket
      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('توكن غير صالح أو منتهي الصلاحية'));
    }
  });

  // ---- تسجيل الأحداث ----
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: user=${socket.user.id} (${socket.user.full_name}) | socket=${socket.id}`);
    registerSocketEvents(io, socket);
  });

  console.log('✅ Socket.io initialized');
  return io;
};

/**
 * الحصول على instance الـ io لاستخدامه في أماكن أخرى (مثل messages.service.js)
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io لم يتم تهيئته بعد. استدع initSocket أولاً.');
  }
  return io;
};

module.exports = { initSocket, getIO };

