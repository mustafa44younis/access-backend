const db = require('../../config/db');
const { getIO } = require('../../socket');

/**
 * دالة مساعدة لإرسال إشعار لحظي عبر Socket.io بأمان
 */
const emitNotification = (userId, notification) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('notification_received', notification);
  } catch (_) {
    // في حال لم يتم تهيئة الـ socket
  }
};

/**
 * إنشاء وحفظ إشعار جديد في قاعدة البيانات وبثه لحظياً للمستخدم
 */
const createNotification = async (userId, { title, body, type = 'system', link = null }) => {
  if (!userId || !title || !body) return null;

  try {
    const res = await db.query(
      `INSERT INTO notifications (user_id, title, body, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, body, type, link]
    );

    const notification = res.rows[0];
    emitNotification(userId, notification);
    return notification;
  } catch (error) {
    console.error('❌ Failed to create notification:', error.message);
    return null;
  }
};

/**
 * جلب قائمة إشعارات المستخدم مع التصفية والصفحات
 */
const getUserNotifications = async (userId, query = {}) => {
  const { page = 1, limit = 20, unreadOnly = 'false' } = query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  // إحصائية عدد غير المقروء
  const unreadRes = await db.query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  const unreadCount = unreadRes.rows[0]?.count || 0;

  // إجمالي الإشعارات
  let countSql = 'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1';
  let dataSql = `
    SELECT id, title, body, type, link, is_read, created_at
    FROM notifications
    WHERE user_id = $1
  `;
  const params = [userId];

  if (unreadOnly === 'true') {
    countSql += ' AND is_read = false';
    dataSql += ' AND is_read = false';
  }

  dataSql += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;

  const totalRes = await db.query(countSql, params);
  const dataRes = await db.query(dataSql, [userId, parseInt(limit), offset]);

  return {
    total: totalRes.rows[0]?.total || 0,
    unread_count: unreadCount,
    page: parseInt(page),
    limit: parseInt(limit),
    notifications: dataRes.rows,
  };
};

/**
 * تعليم إشعار واحد كمقروء
 */
const markNotificationAsRead = async (userId, notificationId) => {
  const res = await db.query(
    `UPDATE notifications 
     SET is_read = true 
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read`,
    [notificationId, userId]
  );

  if (res.rows.length === 0) {
    const error = new Error('الإشعار غير موجود');
    error.statusCode = 404;
    throw error;
  }

  return { success: true, message: 'تم تعليم الإشعار كمقروء' };
};

/**
 * تعليم جميع إشعارات المستخدم كمقروءة دفعة واحدة
 */
const markAllNotificationsAsRead = async (userId) => {
  await db.query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
    [userId]
  );

  return { success: true, message: 'تم تعليم جميع الإشعارات كمقروءة' };
};

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};

