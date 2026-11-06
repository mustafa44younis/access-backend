const db = require('../../config/db');
const { getIO } = require('../../socket');
const { isUserOnline } = require('../../socket/events');

/**
 * جلب قائمة محادثات وقنوات المستخدم مع آخر رسالة وعدد غير المقروء
 */
const getUserConversations = async (userId) => {
  const query = `
    SELECT 
      c.id,
      c.title,
      c.type,
      c.last_message_text,
      c.last_message_at,
      c.created_at,
      p.id AS project_id,
      p.title AS project_title,
      p.category AS project_category,
      p.status AS project_status,
      (
        SELECT COUNT(*)::int 
        FROM messages m 
        WHERE m.conversation_id = c.id 
          AND m.created_at > cp.last_read_at 
          AND m.sender_id != $1
      ) AS unread_count,
      (
        SELECT json_agg(
          json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'avatar_url', u.avatar_url,
            'job_title', u.job_title
          )
        )
        FROM conversation_participants cp2
        JOIN users u ON u.id = cp2.user_id
        WHERE cp2.conversation_id = c.id AND u.id != $1
      ) AS other_participants
    FROM conversations c
    JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
    LEFT JOIN projects p ON p.id = c.project_id
    ORDER BY c.last_message_at DESC
  `;

  const result = await db.query(query, [userId]);
  return result.rows;
};

/**
 * جلب تفاصيل محادثة محددة مع المشاركين والمشروع المرتبط
 */
const getConversationDetails = async (userId, conversationId) => {
  // التحقق من المشاركة في المحادثة
  const check = await db.query(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('المحادثة غير موجودة أو ليس لديك صلاحية للوصول إليها');
    error.statusCode = 404;
    throw error;
  }

  const convRes = await db.query(
    `SELECT 
       c.*,
       p.title AS project_title,
       p.category AS project_category,
       p.status AS project_status,
       p.current_phase_name
     FROM conversations c
     LEFT JOIN projects p ON p.id = c.project_id
     WHERE c.id = $1`,
    [conversationId]
  );

  const conv = convRes.rows[0];

  // جلب جميع المشاركين
  const participantsRes = await db.query(
    `SELECT 
       u.id,
       u.full_name,
       u.avatar_url,
       u.job_title,
       r.name AS role_name,
       r.name_ar AS role_name_ar,
       cp.joined_at,
       cp.last_read_at
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE cp.conversation_id = $1
     ORDER BY u.id = $2 DESC, cp.joined_at ASC`,
    [conversationId, userId]
  );

  conv.participants = participantsRes.rows;
  return conv;
};

/**
 * جلب سجل رسائل المحادثة مرتبة زمنياً
 */
const getConversationMessages = async (userId, conversationId, { page = 1, limit = 50 } = {}) => {
  // التحقق من المشاركة
  const check = await db.query(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('ليس لديك صلاحية لعرض رسائل هذه المحادثة');
    error.statusCode = 403;
    throw error;
  }

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  const totalRes = await db.query(
    'SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1',
    [conversationId]
  );

  const messagesRes = await db.query(
    `SELECT 
       m.id,
       m.conversation_id,
       m.sender_id,
       m.message_text,
       m.attachment_url,
       m.attachment_name,
       m.attachment_type,
       m.attachment_size,
       m.is_read,
       m.created_at,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'avatar_url', u.avatar_url,
         'job_title', u.job_title
       ) AS sender
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, parseInt(limit), offset]
  );

  return {
    total: totalRes.rows[0]?.total || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    messages: messagesRes.rows,
  };
};

/**
 * إرسال رسالة جديدة وتحديث توقيت آخر رسالة في المحادثة مع دعم الصوت والمرفقات
 */
const sendMessage = async (userId, conversationId, data = {}) => {
  const {
    messageText,
    attachmentUrl,
    attachmentName,
    attachmentType,
    attachmentSize,
    messageType = 'text',
    audioDuration = null,
    audioWaveform = [],
    simulateFailure = false,
  } = data;

  if ((!messageText || messageText.trim() === '') && !attachmentUrl && messageType !== 'voice_note') {
    const error = new Error('نص الرسالة أو المرفق أو التسجيل الصوتي مطلوب');
    error.statusCode = 400;
    throw error;
  }

  // التحقق من المشاركة
  const check = await db.query(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('لست عضواً في هذه المحادثة');
    error.statusCode = 403;
    throw error;
  }

  const text = (messageText || '').trim();

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. تسجيل الرسالة
    const msgRes = await client.query(
      `INSERT INTO messages (
         conversation_id, sender_id, message_text,
         attachment_url, attachment_name, attachment_type, attachment_size,
         message_type, audio_duration, audio_waveform, is_failed
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       RETURNING *`,
      [
        conversationId,
        userId,
        text || (messageType === 'voice_note' ? 'تسجيل صوتي' : ''),
        attachmentUrl || null,
        attachmentName || null,
        attachmentType || null,
        attachmentSize || null,
        messageType,
        audioDuration,
        JSON.stringify(audioWaveform),
        simulateFailure === true,
      ]
    );

    const message = msgRes.rows[0];

    // 2. تحديث آخر رسالة في المحادثة (فقط إذا لم تفشل الرسالة)
    if (!simulateFailure) {
      let summaryText = text;
      if (messageType === 'voice_note') {
        summaryText = `تسجيل صوتي (${audioDuration || 0} ثانية)`;
      } else if (!summaryText) {
        summaryText = attachmentName ? `مرفق: ${attachmentName}` : 'ملف مرفق';
      }

      await client.query(
        `UPDATE conversations 
         SET last_message_text = $1, last_message_at = NOW() 
         WHERE id = $2`,
        [summaryText, conversationId]
      );

      // 3. تحديث وقت آخر قراءة للمرسل
      await client.query(
        `UPDATE conversation_participants 
         SET last_read_at = NOW() 
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
    }

    // 4. جلب بيانات المرسل للرد
    const senderRes = await client.query(
      'SELECT id, full_name, avatar_url, job_title FROM users WHERE id = $1',
      [userId]
    );
    message.sender = senderRes.rows[0];

    await client.query('COMMIT');

    // ---- إشعار Socket.io بالرسالة الجديدة (للإرسال عبر HTTP REST) ----
    if (!simulateFailure) {
      try {
        const io = getIO();
        io.to(`conversation:${conversationId}`).emit('new_message', {
          conversationId,
          message,
        });
        // إيقاف مؤشر الكتابة
        io.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
          userId,
          conversationId,
        });
      } catch (_socketErr) {
        // Socket.io غير مهيأ — لا نوقف العملية
      }
    }

    return message;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * تعليم رسائل المحادثة كمقروءة للمستخدم
 */
const markConversationAsRead = async (userId, conversationId) => {
  await db.query(
    `UPDATE conversation_participants 
     SET last_read_at = NOW() 
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );

  await db.query(
    `UPDATE messages 
     SET is_read = true 
     WHERE conversation_id = $1 AND sender_id != $2`,
    [conversationId, userId]
  );

  // إشعار Socket.io بقراءة الرسائل
  try {
    const io = getIO();
    io.to(`conversation:${conversationId}`).emit('messages_read', {
      conversationId,
      readBy: userId,
      readAt: new Date().toISOString(),
    });
  } catch (_socketErr) {
    // Socket.io غير مهيأ
  }

  return { success: true, message: 'تم تعليم المحادثة كمقروءة' };
};

/**
 * بدء أو جلب قناة محادثة مشروع محدد وضم أعضاء الفريق تلقائياً
 */
const getOrCreateProjectConversation = async (userId, projectId) => {
  // التحقق من المشروع وصلاحية المستخدم (عميل أو عضو فريق)
  const projectRes = await db.query(
    `SELECT p.*, u.full_name AS client_name 
     FROM projects p 
     JOIN users u ON u.id = p.client_id 
     WHERE p.id = $1`,
    [projectId]
  );

  if (projectRes.rows.length === 0) {
    const error = new Error('المشروع غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const project = projectRes.rows[0];

  // التحقق إن كانت القناة موجودة مسبقاً
  const existingConvRes = await db.query(
    'SELECT * FROM conversations WHERE project_id = $1 LIMIT 1',
    [projectId]
  );

  if (existingConvRes.rows.length > 0) {
    const conv = existingConvRes.rows[0];

    // التأكد من أن المستخدم الحالي مضاف في المشاركين
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conv.id, userId]
    );

    return getConversationDetails(userId, conv.id);
  }

  // إنشاء قناة محادثة جديدة للمشروع
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const convTitle = `قناة مشروع: ${project.title}`;
    const newConvRes = await client.query(
      `INSERT INTO conversations (project_id, title, type, last_message_text, last_message_at)
       VALUES ($1, $2, 'project_channel', 'تم بدء قناة المحادثة للمشروع', NOW())
       RETURNING *`,
      [projectId, convTitle]
    );

    const conv = newConvRes.rows[0];

    // إضافة العميل وقائد الفريق
    const participantsToAdd = new Set([project.client_id]);
    if (project.team_leader_id) {
      participantsToAdd.add(project.team_leader_id);
    }

    // إضافة أعضاء الفريق المسجلين في المشروع
    const membersRes = await client.query(
      'SELECT user_id FROM project_members WHERE project_id = $1',
      [projectId]
    );
    membersRes.rows.forEach(m => participantsToAdd.add(m.user_id));

    // إضافة المستخدم الحالي أيضاً
    participantsToAdd.add(userId);

    for (const pUserId of participantsToAdd) {
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conv.id, pUserId]
      );
    }

    // رسالة افتتاحية من قائد الفريق أو العميل
    const welcomeSender = project.team_leader_id || userId;
    await client.query(
      `INSERT INTO messages (conversation_id, sender_id, message_text)
       VALUES ($1, $2, $3)`,
      [
        conv.id,
        welcomeSender,
        `مرحباً بكم في قناة مشروع "${project.title}". هنا ستتم كافة المناقشات الفنية ومتابعة مخرجات العمل اليومية.`,
      ]
    );

    await client.query('COMMIT');
    return getConversationDetails(userId, conv.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * البحث داخل رسائل المحادثة (شريط البحث داخل المحادثة - الشاشة 1)
 */
const searchConversationMessages = async (userId, conversationId, { query = '' } = {}) => {
  // التحقق من المشاركة
  const check = await db.query(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('ليس لديك صلاحية للبحث في هذه المحادثة');
    error.statusCode = 403;
    throw error;
  }

  const searchTerm = (query || '').trim();
  if (!searchTerm) {
    return { query: '', matches_count: 0, messages: [] };
  }

  const result = await db.query(
    `SELECT 
       m.id,
       m.conversation_id,
       m.sender_id,
       m.message_text,
       m.attachment_url,
       m.attachment_name,
       m.attachment_type,
       m.message_type,
       m.audio_duration,
       m.audio_waveform,
       m.is_failed,
       m.created_at,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'avatar_url', u.avatar_url,
         'job_title', u.job_title
       ) AS sender
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 
       AND (m.message_text ILIKE '%' || $2 || '%' OR m.attachment_name ILIKE '%' || $2 || '%')
     ORDER BY m.created_at DESC`,
    [conversationId, searchTerm]
  );

  return {
    query: searchTerm,
    matches_count: result.rows.length,
    messages: result.rows,
  };
};

/**
 * جلب سياق المشروع المرتبط بالمحادثة للشريط الجانبي (الشاشة 3)
 */
const getConversationProjectContext = async (userId, conversationId) => {
  // جلب المحادثة ومشروعها
  const convRes = await db.query(
    `SELECT c.id AS conversation_id, c.title AS conversation_title, c.project_id
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
     WHERE c.id = $2`,
    [userId, conversationId]
  );

  if (convRes.rows.length === 0) {
    const error = new Error('المحادثة غير موجودة أو غير مصرح لك');
    error.statusCode = 404;
    throw error;
  }

  const conv = convRes.rows[0];
  if (!conv.project_id) {
    return {
      conversation_id: conv.conversation_id,
      conversation_title: conv.conversation_title,
      project: null,
      shared_files_quick: [],
    };
  }

  // تفاصيل المشروع
  const projectRes = await db.query(
    `SELECT 
       p.id,
       p.title,
       p.category,
       p.status,
       p.budget,
       p.current_phase_name,
       p.progress AS progress_percentage,
       p.created_at,
       u.full_name AS client_name,
       tl.full_name AS team_leader_name,
       tl.avatar_url AS team_leader_avatar
     FROM projects p
     JOIN users u ON u.id = p.client_id
     LEFT JOIN users tl ON tl.id = p.team_leader_id
     WHERE p.id = $1`,
    [conv.project_id]
  );

  const project = projectRes.rows[0];

  // عدد أعضاء الفريق
  const teamCountRes = await db.query(
    'SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1',
    [conv.project_id]
  );
  if (project) {
    project.team_members_count = (teamCountRes.rows[0]?.count || 0) + (project.team_leader_name ? 1 : 0);
  }

  // آخر الملفات المشتركة للسياق السريع
  const recentFilesRes = await db.query(
    `SELECT 
       id,
       file_name,
       file_url,
       file_type,
       file_category,
       file_size,
       preview_image_url,
       created_at
     FROM project_shared_files
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 4`,
    [conv.project_id]
  );

  return {
    conversation_id: conv.conversation_id,
    conversation_title: conv.conversation_title,
    project,
    shared_files_quick: recentFilesRes.rows,
  };
};

/**
 * جلب مستودع الملفات والمستندات المشتركة للمشروع (الشاشة 3 يساراً)
 * تصنيفات: all, designs, documents, audio
 */
const getProjectSharedFiles = async (userId, projectId, { category = 'all', search = '', page = 1, limit = 20 } = {}) => {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  let whereClauses = ['psf.project_id = $1'];
  let queryParams = [projectId];
  let paramIndex = 2;

  if (category && category !== 'all') {
    whereClauses.push(`psf.file_category = $${paramIndex}`);
    queryParams.push(category);
    paramIndex++;
  }

  if (search && search.trim() !== '') {
    whereClauses.push(`psf.file_name ILIKE '%' || $${paramIndex} || '%'`);
    queryParams.push(search.trim());
    paramIndex++;
  }

  const whereSql = whereClauses.join(' AND ');

  const totalRes = await db.query(
    `SELECT COUNT(*)::int AS total FROM project_shared_files psf WHERE ${whereSql}`,
    queryParams
  );

  const filesQuery = `
    SELECT 
      psf.id,
      psf.project_id,
      psf.file_name,
      psf.file_url,
      psf.file_type,
      psf.file_category,
      psf.file_size,
      psf.preview_image_url,
      psf.audio_duration,
      psf.created_at,
      json_build_object(
        'id', u.id,
        'full_name', u.full_name,
        'avatar_url', u.avatar_url,
        'job_title', u.job_title
      ) AS uploader
    FROM project_shared_files psf
    LEFT JOIN users u ON u.id = psf.uploaded_by
    WHERE ${whereSql}
    ORDER BY psf.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  queryParams.push(parseInt(limit), offset);

  const filesRes = await db.query(filesQuery, queryParams);

  // إحصائيات المستودع بالأقسام
  const statsRes = await db.query(
    `SELECT 
       file_category,
       COUNT(*)::int AS count
     FROM project_shared_files
     WHERE project_id = $1
     GROUP BY file_category`,
    [projectId]
  );

  const categoryStats = {
    all: totalRes.rows[0]?.total || 0,
    designs: 0,
    documents: 0,
    audio: 0,
    other: 0,
  };

  statsRes.rows.forEach(r => {
    if (categoryStats[r.file_category] !== undefined) {
      categoryStats[r.file_category] = r.count;
    }
  });

  return {
    total: totalRes.rows[0]?.total || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    category,
    search: search || '',
    category_stats: categoryStats,
    files: filesRes.rows,
  };
};

/**
 * رفع / إضافة ملف إلى مستودع ملفات المشروع المشتركة
 */
const uploadProjectSharedFile = async (userId, projectId, fileData = {}) => {
  const {
    fileName,
    fileUrl,
    fileType,
    fileCategory = 'documents',
    fileSize = '1.0 MB',
    previewImageUrl = null,
    audioDuration = null,
  } = fileData;

  if (!fileName || !fileUrl || !fileType) {
    const error = new Error('اسم الملف ورابطه ونوعه مطلوبان');
    error.statusCode = 400;
    throw error;
  }

  const result = await db.query(
    `INSERT INTO project_shared_files (
       project_id, uploaded_by, file_name, file_url,
       file_type, file_category, file_size, preview_image_url, audio_duration
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      projectId,
      userId,
      fileName,
      fileUrl,
      fileType.toUpperCase(),
      fileCategory,
      fileSize,
      previewImageUrl,
      audioDuration,
    ]
  );

  const file = result.rows[0];

  const uploaderRes = await db.query(
    'SELECT id, full_name, avatar_url, job_title FROM users WHERE id = $1',
    [userId]
  );
  file.uploader = uploaderRes.rows[0];

  return file;
};

/**
 * جلب تفاصيل معاينة الملف / الصورة داخل المحادثة (الشاشة 4 يساراً Lightbox)
 */
const getFilePreviewDetails = async (userId, fileId) => {
  const fileRes = await db.query(
    `SELECT 
       psf.*,
       p.title AS project_title,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'avatar_url', u.avatar_url,
         'job_title', u.job_title
       ) AS uploader
     FROM project_shared_files psf
     JOIN projects p ON p.id = psf.project_id
     LEFT JOIN users u ON u.id = psf.uploaded_by
     WHERE psf.id = $1`,
    [fileId]
  );

  if (fileRes.rows.length === 0) {
    const error = new Error('الملف غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const file = fileRes.rows[0];

  return {
    id: file.id,
    project_id: file.project_id,
    project_title: file.project_title,
    file_name: file.file_name,
    file_url: file.file_url,
    file_type: file.file_type,
    file_category: file.file_category,
    file_size: file.file_size,
    preview_image_url: file.preview_image_url || file.file_url,
    dimensions: file.file_type === 'PNG' || file.file_type === 'JPG' ? '1920x1080' : null,
    uploader: file.uploader,
    created_at: file.created_at,
    download_url: file.file_url,
  };
};

/**
 * طلب تدخل إدارة ACCESS لفض نزاع في المحادثة (الشاشة 4 يميناً)
 */
const requestChatIntervention = async (userId, conversationId, interventionData = {}) => {
  const {
    reason = 'dispute_specifications',
    reasonLabel = 'خلاف حول مواصفات العقد',
    details,
    includeTranscript = true,
  } = interventionData;

  if (!details || details.trim() === '') {
    const error = new Error('يرجى تقديم تفاصيل وأسباب طلب تدخل الإدارة');
    error.statusCode = 400;
    throw error;
  }

  // جلب المحادثة والمشروع
  const convRes = await db.query(
    'SELECT * FROM conversations WHERE id = $1',
    [conversationId]
  );

  if (convRes.rows.length === 0) {
    const error = new Error('المحادثة غير موجودة');
    error.statusCode = 404;
    throw error;
  }

  const conv = convRes.rows[0];

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. تسجيل طلب التدخل
    const intervRes = await client.query(
      `INSERT INTO chat_interventions (
         conversation_id, project_id, requested_by,
         reason, reason_label, details, include_transcript, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_admin')
       RETURNING *`,
      [
        conversationId,
        conv.project_id,
        userId,
        reason,
        reasonLabel,
        details.trim(),
        includeTranscript,
      ]
    );

    const intervention = intervRes.rows[0];

    // 2. إدراج رسالة إشعار نظام داخل المحادثة
    const noticeText = `⚠️ تم تقديم طلب تدخل إدارة المنصة لفض نزاع ومتابعة فنية.\nالسبب: ${reasonLabel}\nرقم التذكرة: #${intervention.id}\nسيقوم ممثل فريق العمليات بالانضمام للمحادثة ومراجعة تفاصيل العقد والعمل.`;

    const systemMsgRes = await client.query(
      `INSERT INTO messages (
         conversation_id, sender_id, message_text, message_type
       ) VALUES ($1, $2, $3, 'system')
       RETURNING *`,
      [conversationId, userId, noticeText]
    );

    // 3. تحديث آخر رسالة في المحادثة
    await client.query(
      `UPDATE conversations 
       SET last_message_text = '⚠️ طلب تدخل إدارة المنصة', last_message_at = NOW() 
       WHERE id = $1`,
      [conversationId]
    );

    await client.query('COMMIT');

    // ---- إشعار Socket.io برسالة النظام لجميع أعضاء المحادثة ----
    try {
      const io = getIO();
      io.to(`conversation:${conversationId}`).emit('new_message', {
        conversationId: parseInt(conversationId),
        message: { ...systemMsgRes.rows[0], message_type: 'system' },
      });
      // إشعار خاص بحدث التدخل الإداري
      io.to(`conversation:${conversationId}`).emit('intervention_requested', {
        conversationId: parseInt(conversationId),
        ticketId: intervention.id,
        reason: reasonLabel,
        requestedBy: userId,
        requestedAt: intervention.created_at,
      });
    } catch (_socketErr) {
      // Socket.io غير مهيأ
    }

    return {
      success: true,
      message: 'تم إرسال طلب تدخل إدارة المنصة بنجاح وسيتم التواصل عبر المحادثة',
      intervention,
      system_message: systemMsgRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * إعادة إرسال رسالة متعثرة (الشاشة 5)
 */
const retryFailedMessage = async (userId, messageId) => {
  const msgRes = await db.query(
    'SELECT * FROM messages WHERE id = $1 AND sender_id = $2',
    [messageId, userId]
  );

  if (msgRes.rows.length === 0) {
    const error = new Error('الرسالة غير موجودة أو لست صاحبها');
    error.statusCode = 404;
    throw error;
  }

  const message = msgRes.rows[0];

  const updateRes = await db.query(
    `UPDATE messages 
     SET is_failed = false, created_at = NOW() 
     WHERE id = $1 
     RETURNING *`,
    [messageId]
  );

  const updatedMessage = updateRes.rows[0];

  // تحديث المحادثة
  await db.query(
    `UPDATE conversations 
     SET last_message_text = $1, last_message_at = NOW() 
     WHERE id = $2`,
    [updatedMessage.message_text, updatedMessage.conversation_id]
  );

  const senderRes = await db.query(
    'SELECT id, full_name, avatar_url, job_title FROM users WHERE id = $1',
    [userId]
  );
  updatedMessage.sender = senderRes.rows[0];

  // ---- إشعار Socket.io بالرسالة المُعادة إرسالها ----
  try {
    const io = getIO();
    io.to(`conversation:${updatedMessage.conversation_id}`).emit('new_message', {
      conversationId: updatedMessage.conversation_id,
      message: updatedMessage,
      isRetry: true,
    });
  } catch (_socketErr) {
    // Socket.io غير مهيأ
  }

  return updatedMessage;
};

/**
 * جلب حالة الاتصال المباشر للمشاركين في المحادثة (الشاشة 5)
 */
const getConversationPresence = async (userId, conversationId) => {
  // التحقق من المشاركة
  const check = await db.query(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('غير مصرح لك بعرض هذه المحادثة');
    error.statusCode = 403;
    throw error;
  }

  const participantsRes = await db.query(
    `SELECT 
       u.id,
       u.full_name,
       u.avatar_url,
       u.job_title,
       r.name AS role_name,
       r.name_ar AS role_name_ar,
       cp.last_read_at
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE cp.conversation_id = $1`,
    [conversationId]
  );

  const presenceList = participantsRes.rows.map(p => {
    // استخدام الـ onlineUsers Map الحقيقي من Socket.io
    const online = isUserOnline(p.id);
    return {
      id: p.id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      role: p.role_name_ar || p.role_name,
      status: online ? 'online' : 'offline',
      status_label: online ? 'متصل الآن' : 'غير متواجد حالياً',
      last_active: p.last_read_at || null,
    };
  });

  return {
    conversation_id: parseInt(conversationId),
    participants: presenceList,
  };
};

module.exports = {
  getUserConversations,
  getConversationDetails,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
  getOrCreateProjectConversation,
  searchConversationMessages,
  getConversationProjectContext,
  getProjectSharedFiles,
  uploadProjectSharedFile,
  getFilePreviewDetails,
  requestChatIntervention,
  retryFailedMessage,
  getConversationPresence,
};
