const db = require('../config/db');

/**
 * خريطة تتبع المستخدمين المتصلين: userId → Set<socketId>
 * (نفس المستخدم قد يكون متصلاً من أكثر من جهاز)
 */
const onlineUsers = new Map();

/**
 * تسجيل المستخدم كـ online وإضافة socketId
 */
const addOnlineUser = (userId, socketId) => {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
};

/**
 * إزالة socketId — إذا لم يتبقَّ أي socket للمستخدم يصبح offline
 */
const removeOnlineUser = (userId, socketId) => {
  if (onlineUsers.has(userId)) {
    onlineUsers.get(userId).delete(socketId);
    if (onlineUsers.get(userId).size === 0) {
      onlineUsers.delete(userId);
    }
  }
};

/**
 * هل المستخدم متصل الآن؟
 */
const isUserOnline = (userId) => onlineUsers.has(userId);

/**
 * تسجيل جميع أحداث Socket للـ socket الواحد
 */
const registerSocketEvents = (io, socket) => {
  const userId = socket.user.id;

  // ===== 1. الانضمام لغرف المحادثات عند الاتصال =====
  socket.on('join_conversations', async () => {
    try {
      // جلب كل المحادثات التي ينتمي إليها المستخدم
      const result = await db.query(
        `SELECT conversation_id FROM conversation_participants WHERE user_id = $1`,
        [userId]
      );

      const rooms = result.rows.map((r) => `conversation:${r.conversation_id}`);
      if (rooms.length > 0) {
        socket.join(rooms);
        console.log(`📌 User ${userId} joined ${rooms.length} conversation room(s)`);
      }

      socket.emit('conversations_joined', { count: rooms.length });
    } catch (err) {
      console.error('join_conversations error:', err.message);
      socket.emit('error', { message: 'فشل الانضمام للغرف' });
    }
  });

  // ===== 2. الانضمام لغرفة مشروع (لاستقبال أحداث المراحل والعقود) =====
  socket.on('join_project', async (data) => {
    try {
      const { projectId } = data || {};
      if (!projectId) return socket.emit('error', { message: 'projectId مطلوب' });

      // التحقق: المستخدم عميل للمشروع أو عضو فريق فيه
      const check = await db.query(
        `SELECT 1 FROM projects WHERE id = $1 AND client_id = $2
         UNION
         SELECT 1 FROM project_team_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId]
      );

      if (check.rows.length === 0) {
        return socket.emit('error', { message: 'ليس لديك صلاحية للانضمام لغرفة هذا المشروع' });
      }

      socket.join(`project:${projectId}`);
      socket.emit('joined_project', { projectId });
    } catch (err) {
      console.error('join_project error:', err.message);
      socket.emit('error', { message: 'خطأ عند الانضمام لغرفة المشروع' });
    }
  });

  // ===== 3. الانضمام لغرفة المستخدم الشخصية (لإشعارات العقود) =====
  socket.join(`user:${userId}`);

  // ===== 4. الانضمام لغرفة محادثة محددة =====
  socket.on('join_conversation', async (data) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId) return socket.emit('error', { message: 'conversationId مطلوب' });

      // التحقق من المشاركة
      const check = await db.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (check.rows.length === 0) {
        return socket.emit('error', { message: 'ليس لديك صلاحية للانضمام لهذه المحادثة' });
      }

      const room = `conversation:${conversationId}`;
      socket.join(room);

      // إشعار بقية الأعضاء أن المستخدم انضم (online)
      socket.to(room).emit('user_joined', {
        userId,
        fullName: socket.user.full_name,
        avatarUrl: socket.user.avatar_url,
        conversationId,
      });

      socket.emit('joined_conversation', { conversationId });
    } catch (err) {
      console.error('join_conversation error:', err.message);
      socket.emit('error', { message: 'خطأ عند الانضمام للمحادثة' });
    }
  });

  // ===== 3. مغادرة غرفة محادثة =====
  socket.on('leave_conversation', (data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;
    socket.leave(`conversation:${conversationId}`);
    socket.emit('left_conversation', { conversationId });
  });

  // ===== 4. مؤشر الكتابة (Typing Indicator) =====
  socket.on('typing_start', (data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;

    socket.to(`conversation:${conversationId}`).emit('user_typing', {
      userId,
      fullName: socket.user.full_name,
      avatarUrl: socket.user.avatar_url,
      conversationId,
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversationId } = data || {};
    if (!conversationId) return;

    socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
      userId,
      conversationId,
    });
  });

  // ===== 5. إرسال رسالة عبر Socket (بديل أو إضافة لـ HTTP) =====
  socket.on('send_message', async (data, callback) => {
    try {
      const { conversationId, messageText, messageType = 'text', attachmentUrl,
              attachmentName, attachmentType, attachmentSize,
              audioDuration, audioWaveform } = data || {};

      if (!conversationId) {
        return callback?.({ success: false, message: 'conversationId مطلوب' });
      }
      if (!messageText && !attachmentUrl && messageType !== 'voice_note') {
        return callback?.({ success: false, message: 'نص الرسالة أو مرفق مطلوب' });
      }

      // التحقق من المشاركة
      const check = await db.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      if (check.rows.length === 0) {
        return callback?.({ success: false, message: 'ليس لديك صلاحية للإرسال' });
      }

      const text = (messageText || '').trim();

      // حفظ الرسالة في قاعدة البيانات
      const msgRes = await db.query(
        `INSERT INTO messages (
           conversation_id, sender_id, message_text,
           attachment_url, attachment_name, attachment_type, attachment_size,
           message_type, audio_duration, audio_waveform
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING *`,
        [
          conversationId, userId,
          text || (messageType === 'voice_note' ? 'تسجيل صوتي' : ''),
          attachmentUrl || null, attachmentName || null,
          attachmentType || null, attachmentSize || null,
          messageType, audioDuration || null,
          JSON.stringify(audioWaveform || []),
        ]
      );

      const message = msgRes.rows[0];

      // تحديث آخر رسالة في المحادثة
      let summaryText = text;
      if (messageType === 'voice_note') summaryText = `تسجيل صوتي (${audioDuration || 0} ثانية)`;
      else if (!summaryText) summaryText = attachmentName ? `مرفق: ${attachmentName}` : 'ملف مرفق';

      await db.query(
        `UPDATE conversations SET last_message_text = $1, last_message_at = NOW() WHERE id = $2`,
        [summaryText, conversationId]
      );
      await db.query(
        `UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      // جلب بيانات المرسل
      const senderRes = await db.query(
        'SELECT id, full_name, avatar_url, job_title FROM users WHERE id = $1',
        [userId]
      );
      message.sender = senderRes.rows[0];

      // إشعار كل أعضاء الغرفة بالرسالة الجديدة (بما فيهم المرسل)
      io.to(`conversation:${conversationId}`).emit('new_message', {
        conversationId,
        message,
      });

      // إيقاف مؤشر الكتابة تلقائياً بعد الإرسال
      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        userId,
        conversationId,
      });

      callback?.({ success: true, message });
    } catch (err) {
      console.error('send_message socket error:', err.message);
      callback?.({ success: false, message: 'خطأ أثناء إرسال الرسالة' });
    }
  });

  // ===== 6. تعليم المحادثة كمقروءة عبر Socket =====
  socket.on('mark_read', async (data) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId) return;

      await db.query(
        `UPDATE conversation_participants SET last_read_at = NOW()
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      await db.query(
        `UPDATE messages SET is_read = true
         WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
        [conversationId, userId]
      );

      // إخبار بقية الأعضاء
      socket.to(`conversation:${conversationId}`).emit('messages_read', {
        conversationId,
        readBy: userId,
        readAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('mark_read error:', err.message);
    }
  });

  // ===== 7. حالة الـ Presence (Online/Offline) =====
  addOnlineUser(userId, socket.id);

  // إشعار عام بأن المستخدم أصبح online
  socket.broadcast.emit('user_online', {
    userId,
    fullName: socket.user.full_name,
    avatarUrl: socket.user.avatar_url,
    onlineAt: new Date().toISOString(),
  });

  // إرسال قائمة المتصلين حالياً للمستخدم الجديد
  socket.emit('online_users', {
    userIds: Array.from(onlineUsers.keys()),
  });

  // طلب حالة اتصال مستخدمين محددين
  socket.on('get_presence', (data) => {
    const { userIds } = data || {};
    if (!Array.isArray(userIds)) return;

    const presence = {};
    userIds.forEach((id) => {
      presence[id] = isUserOnline(id);
    });

    socket.emit('presence_status', { presence });
  });

  // ===== 8. قطع الاتصال =====
  socket.on('disconnect', (reason) => {
    removeOnlineUser(userId, socket.id);
    console.log(`🔌 Socket disconnected: user=${userId} | reason=${reason}`);

    // إشعار الجميع بأن المستخدم أصبح offline (فقط إذا لم يتبقَّ له sessions أخرى)
    if (!isUserOnline(userId)) {
      socket.broadcast.emit('user_offline', {
        userId,
        offlineAt: new Date().toISOString(),
      });
    }
  });
};

module.exports = registerSocketEvents;
module.exports.isUserOnline = isUserOnline;
module.exports.onlineUsers = onlineUsers;

