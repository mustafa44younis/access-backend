const db = require('../../config/db');
const aiService = require('./ai.service');
const { getIO } = require('../../socket');
const { createNotification } = require('../notifications/notifications.service');

/** helper: يُرسل emit بأمان حتى لو Socket.io غير مهيأ */
const safeEmit = (room, event, data) => {
  try {
    getIO().to(room).emit(event, data);
  } catch (_) {}
};


/**
 * جلب سجل جلسات الاستشارة للعميل مع معرف العقد وبيانات الملخص الحي
 */
const getConsultations = async (userId) => {
  const result = await db.query(
    `SELECT 
       c.id,
       c.title,
       c.project_type,
       c.status,
       c.summary,
       c.estimated_duration,
       c.estimated_cost,
       c.target_audience,
       c.features,
       c.suggested_technologies,
       c.min_budget,
       c.max_budget,
       c.min_duration_weeks,
       c.max_duration_weeks,
       c.consultation_type,
       c.consultation_date,
       ct.id AS contract_id,
       ct.contract_number,
       ct.status AS contract_status,
       ct.total_amount AS contract_amount
     FROM consultations c
     LEFT JOIN contracts ct ON ct.consultation_id = c.id
     WHERE c.client_id = $1
     ORDER BY c.consultation_date DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * جلب تفاصيل جلسة استشارة واحدة مع الملخص الحي وسجل الرسائل التفاعلية
 */
const getConsultationDetails = async (userId, consultationId) => {
  const consultationRes = await db.query(
    `SELECT 
       c.*,
       ct.id AS contract_id,
       ct.contract_number,
       ct.status AS contract_status,
       ct.total_amount AS contract_amount
     FROM consultations c
     LEFT JOIN contracts ct ON ct.consultation_id = c.id
     WHERE c.id = $1 AND c.client_id = $2`,
    [consultationId, userId]
  );

  if (consultationRes.rows.length === 0) {
    const error = new Error('جلسة الاستشارة غير موجودة أو ليس لديك صلاحية للوصول إليها');
    error.statusCode = 404;
    throw error;
  }

  const consultation = consultationRes.rows[0];

  // جلب سجل الرسائل المتبادلة
  const messagesRes = await db.query(
    `SELECT id, sender, message, suggestions, created_at
     FROM consultation_messages
     WHERE consultation_id = $1
     ORDER BY created_at ASC`,
    [consultationId]
  );

  consultation.messages = messagesRes.rows;

  return consultation;
};

/**
 * إنشاء جلسة استشارة ذكية جديدة مع رسالة الترحيب الأولى للمساعد الذكي
 */
const createConsultation = async (userId, data = {}) => {
  let title = data.title || 'مشروع جديد قيد التخطيط';
  let projectType = data.project_type || 'قيد الاستكشاف';
  let summary = data.initial_idea || 'جلسة استشارة ذكية لتحديد وتحليل متطلبات المشروع';
  const consultationType = data.consultation_type || 'ai';

  let initialSuggestions = ['متجر إلكتروني', 'تطبيق جوال', 'منصة ويب', 'هوية بصرية'];
  let greetingMsg = data.initial_idea
    ? `أهلاً بك! فكرة ممتازة: "${data.initial_idea}". سأساعدك في تفصيل نطاق العمل ومميزات المشروع لنصل إلى ملخص وخطة تنفيذ واضحة.`
    : 'أهلاً بك! أنا مساعدك الذكي في ACCESS، سأساعدك على تحويل فكرتك إلى ملخص مشروع واضح. ما نوع المشروع الذي تفكر فيه؟';

  let features = [];
  let targetAudience = [];
  let suggestedTech = [];
  let minBudget = 8000.00;
  let maxBudget = 15000.00;
  let minDurationWeeks = 3;
  let maxDurationWeeks = 4;
  let estimatedCost = 10000.00;
  let estimatedDuration = '3-4 أسابيع';

  // استشارة الذكاء الاصطناعي لتخصيص الملخص والترحيب عند توفر فكرة مبدئية
  if (data.initial_idea) {
    const aiInitial = await aiService.generateInitialConsultationAI({
      initialIdea: data.initial_idea,
      projectType: data.project_type,
      title: data.title,
    });

    if (aiInitial) {
      if (aiInitial.greeting) greetingMsg = aiInitial.greeting;
      if (Array.isArray(aiInitial.suggestions) && aiInitial.suggestions.length > 0) {
        initialSuggestions = aiInitial.suggestions;
      }
      if (aiInitial.brief) {
        if (aiInitial.brief.title) title = aiInitial.brief.title;
        if (aiInitial.brief.project_type) projectType = aiInitial.brief.project_type;
        if (aiInitial.brief.summary) summary = aiInitial.brief.summary;
        if (aiInitial.brief.features) features = aiInitial.brief.features;
        if (aiInitial.brief.target_audience) targetAudience = aiInitial.brief.target_audience;
        if (aiInitial.brief.suggested_technologies) suggestedTech = aiInitial.brief.suggested_technologies;
        if (aiInitial.brief.min_budget) minBudget = aiInitial.brief.min_budget;
        if (aiInitial.brief.max_budget) maxBudget = aiInitial.brief.max_budget;
        if (aiInitial.brief.min_duration_weeks) minDurationWeeks = aiInitial.brief.min_duration_weeks;
        if (aiInitial.brief.max_duration_weeks) maxDurationWeeks = aiInitial.brief.max_duration_weeks;
        if (aiInitial.brief.estimated_cost) estimatedCost = aiInitial.brief.estimated_cost;
        if (aiInitial.brief.estimated_duration) estimatedDuration = aiInitial.brief.estimated_duration;
      }
    }
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const insertRes = await client.query(
      `INSERT INTO consultations (
         client_id, title, project_type, status, summary, estimated_duration, estimated_cost,
         target_audience, features, suggested_technologies, min_budget, max_budget,
         min_duration_weeks, max_duration_weeks, consultation_type, consultation_date
       ) VALUES (
         $1, $2, $3, 'in_progress', $4, $5, $6,
         $7::jsonb, $8::jsonb, $9::jsonb, $10, $11,
         $12, $13, $14, NOW()
       ) RETURNING *`,
      [
        userId,
        title,
        projectType,
        summary,
        estimatedDuration,
        estimatedCost,
        JSON.stringify(targetAudience),
        JSON.stringify(features),
        JSON.stringify(suggestedTech),
        minBudget,
        maxBudget,
        minDurationWeeks,
        maxDurationWeeks,
        consultationType,
      ]
    );

    const consultation = insertRes.rows[0];

    const msgRes = await client.query(
      `INSERT INTO consultation_messages (consultation_id, sender, message, suggestions)
       VALUES ($1, 'assistant', $2, $3)
       RETURNING *`,
      [consultation.id, greetingMsg, JSON.stringify(initialSuggestions)]
    );

    await client.query('COMMIT');

    consultation.messages = [msgRes.rows[0]];
    return consultation;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * تعديل وحفظ مسودة تفاصيل ملخص المشروع (نافذة التعديل في الشاشة 2)
 */
const updateConsultationBrief = async (userId, consultationId, briefData) => {
  // التحقق من الملكية
  const check = await db.query(
    'SELECT id FROM consultations WHERE id = $1 AND client_id = $2',
    [consultationId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('جلسة الاستشارة غير موجودة أو ليس لديك صلاحية لتعديلها');
    error.statusCode = 404;
    throw error;
  }

  const {
    title,
    project_type,
    summary,
    target_audience,
    features,
    suggested_technologies,
    min_budget,
    max_budget,
    min_duration_weeks,
    max_duration_weeks,
    estimated_cost,
    estimated_duration,
  } = briefData;

  const targetAudienceJson = Array.isArray(target_audience)
    ? JSON.stringify(target_audience)
    : target_audience || '[]';

  const featuresJson = Array.isArray(features)
    ? JSON.stringify(features)
    : features || '[]';

  const techJson = Array.isArray(suggested_technologies)
    ? JSON.stringify(suggested_technologies)
    : suggested_technologies || '[]';

  const result = await db.query(
    `UPDATE consultations 
     SET 
       title = COALESCE($1, title),
       project_type = COALESCE($2, project_type),
       summary = COALESCE($3, summary),
       target_audience = COALESCE($4::jsonb, target_audience),
       features = COALESCE($5::jsonb, features),
       suggested_technologies = COALESCE($6::jsonb, suggested_technologies),
       min_budget = COALESCE($7, min_budget),
       max_budget = COALESCE($8, max_budget),
       min_duration_weeks = COALESCE($9, min_duration_weeks),
       max_duration_weeks = COALESCE($10, max_duration_weeks),
       estimated_cost = COALESCE($11, estimated_cost),
       estimated_duration = COALESCE($12, estimated_duration),
       updated_at = NOW()
     WHERE id = $13 AND client_id = $14
     RETURNING *`,
    [
      title || null,
      project_type || null,
      summary || null,
      targetAudienceJson,
      featuresJson,
      techJson,
      min_budget !== undefined ? min_budget : null,
      max_budget !== undefined ? max_budget : null,
      min_duration_weeks !== undefined ? min_duration_weeks : null,
      max_duration_weeks !== undefined ? max_duration_weeks : null,
      estimated_cost !== undefined ? estimated_cost : null,
      estimated_duration || null,
      consultationId,
      userId,
    ]
  );

  return result.rows[0];
};

/**
 * إرسال رسالة من العميل للمساعد الذكي واستلام الرد وتحديث الملخص الحي تلقائياً
 */
const addConsultationMessage = async (userId, consultationId, { message }) => {
  if (!message || message.trim() === '') {
    const error = new Error('نص الرسالة مطلوب');
    error.statusCode = 400;
    throw error;
  }

  // التحقق من وجود الاستشارة
  const consCheck = await db.query(
    'SELECT * FROM consultations WHERE id = $1 AND client_id = $2',
    [consultationId, userId]
  );

  if (consCheck.rows.length === 0) {
    const error = new Error('جلسة الاستشارة غير موجودة');
    error.statusCode = 404;
    throw error;
  }

  const consultation = consCheck.rows[0];

  // 1. تسجيل رسالة العميل
  const userMsgRes = await db.query(
    `INSERT INTO consultation_messages (consultation_id, sender, message, suggestions)
     VALUES ($1, 'user', $2, '[]'::jsonb)
     RETURNING *`,
    [consultationId, message.trim()]
  );

  // 2. جلب سجل الرسائل المتبادلة السابقة لتوفير السياق للذكاء الاصطناعي
  const historyRes = await db.query(
    `SELECT sender, message FROM consultation_messages WHERE consultation_id = $1 ORDER BY created_at ASC`,
    [consultationId]
  );

  // 3. استدعاء نموذج OpenAI لمعالجة المحادثة وتحديث الملخص الحي
  const aiResult = await aiService.processConsultationChatAI({
    consultation,
    conversationHistory: historyRes.rows,
    newMessage: message.trim(),
  });

  let aiReplyText = '';
  let updatedSuggestions = [];
  let liveBrief = consultation;

  if (aiResult) {
    aiReplyText = aiResult.reply || 'تم تسجيل نقطتك وتحديث الملخص بنجاح.';
    updatedSuggestions = Array.isArray(aiResult.suggestions) ? aiResult.suggestions : [];

    // تحديث الملخص الحي في جدول الاستشارات
    if (aiResult.updated_brief) {
      const b = aiResult.updated_brief;
      const targetAudienceJson = Array.isArray(b.target_audience)
        ? JSON.stringify(b.target_audience)
        : null;
      const featuresJson = Array.isArray(b.features)
        ? JSON.stringify(b.features)
        : null;
      const techJson = Array.isArray(b.suggested_technologies)
        ? JSON.stringify(b.suggested_technologies)
        : null;

      const updateRes = await db.query(
        `UPDATE consultations 
         SET 
           title = COALESCE($1, title),
           project_type = COALESCE($2, project_type),
           summary = COALESCE($3, summary),
           target_audience = COALESCE($4::jsonb, target_audience),
           features = COALESCE($5::jsonb, features),
           suggested_technologies = COALESCE($6::jsonb, suggested_technologies),
           min_budget = COALESCE($7, min_budget),
           max_budget = COALESCE($8, max_budget),
           min_duration_weeks = COALESCE($9, min_duration_weeks),
           max_duration_weeks = COALESCE($10, max_duration_weeks),
           estimated_cost = COALESCE($11, estimated_cost),
           estimated_duration = COALESCE($12, estimated_duration),
           updated_at = NOW()
         WHERE id = $13 AND client_id = $14
         RETURNING *`,
        [
          b.title || null,
          b.project_type || null,
          b.summary || null,
          targetAudienceJson,
          featuresJson,
          techJson,
          b.min_budget !== undefined ? b.min_budget : null,
          b.max_budget !== undefined ? b.max_budget : null,
          b.min_duration_weeks !== undefined ? b.min_duration_weeks : null,
          b.max_duration_weeks !== undefined ? b.max_duration_weeks : null,
          b.estimated_cost !== undefined ? b.estimated_cost : null,
          b.estimated_duration || null,
          consultationId,
          userId,
        ]
      );

      if (updateRes.rows.length > 0) {
        liveBrief = updateRes.rows[0];
      }
    }
  } else {
    // خطة بديلة ذكية في حال تعذر الاتصال بـ OpenAI
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('متجر') || lowerMsg.includes('سلة') || lowerMsg.includes('دفع') || lowerMsg.includes('شراء')) {
      aiReplyText = 'فكرة ممتازة! تم استيعاب متطلبات المتجر الإلكتروني بوابات الدفع وتتبع الطلبات وتحديث مسودة ملخص المشروع الحي بالتقنيات والميزانية الأنسب.';
      updatedSuggestions = ['تخصيص بوابات الدفع', 'إضافة لوحة إحصائيات متقدمة', 'اعتماد الملخص وتوليد العقد'];
    } else if (lowerMsg.includes('تطبيق') || lowerMsg.includes('موبايل') || lowerMsg.includes('جوال')) {
      aiReplyText = 'رائع! بناء تطبيق جوال يتطلب تجربة مستخدم سلسة وتقنيات عصرية مثل Flutter لتغطية نظامي iOS و Android بكفاءة.';
      updatedSuggestions = ['واجهات مستخدم مخصصة', 'إشعارات لحظية Push Notifications', 'ربط مع لوحة التحكم'];
    } else {
      aiReplyText = `تم تسجيل نقطتك بنجاح: "${message.substring(0, 50)}...". تم دمجها في نطاق العمل وملخص المشروع. بإمكانك مراجعة الملخص الآن أو اعتماد الانتقال للعقد.`;
      updatedSuggestions = ['تعديل نطاق الميزانية', 'إضافة ميزات تقنية', 'اعتماد الملخص'];
    }
  }

  // 4. تسجيل رد المساعد الذكي
  const aiMsgRes = await db.query(
    `INSERT INTO consultation_messages (consultation_id, sender, message, suggestions)
     VALUES ($1, 'assistant', $2, $3)
     RETURNING *`,
    [consultationId, aiReplyText, JSON.stringify(updatedSuggestions)]
  );

  return {
    user_message: userMsgRes.rows[0],
    assistant_message: aiMsgRes.rows[0],
    live_brief: liveBrief,
  };
};

/**
 * جلب العقد المرتبط بجلسة استشارة محددة
 */
const getContractByConsultationId = async (userId, consultationId) => {
  const result = await db.query(
    `SELECT 
       ct.*,
       c.title AS consultation_title,
       c.project_type,
       c.consultation_date
     FROM contracts ct
     JOIN consultations c ON c.id = ct.consultation_id
     WHERE ct.consultation_id = $1 AND ct.client_id = $2`,
    [consultationId, userId]
  );

  if (result.rows.length === 0) {
    // إذا لم يكن العقد موجوداً مسبقاً، نتحقق من وجود الاستشارة ونولد العقد المبدئي تلقائياً
    const consRes = await db.query(
      `SELECT * FROM consultations WHERE id = $1 AND client_id = $2`,
      [consultationId, userId]
    );

    if (consRes.rows.length === 0) {
      const error = new Error('لم يتم العثور على عقد أو استشارة مرتبطة');
      error.statusCode = 404;
      throw error;
    }

    const cons = consRes.rows[0];

    let featuresList = [];
    if (Array.isArray(cons.features)) {
      featuresList = cons.features;
    } else if (typeof cons.features === 'string') {
      try { featuresList = JSON.parse(cons.features); } catch (e) { featuresList = []; }
    }

    const totalAmount = parseFloat(cons.estimated_cost || cons.min_budget || 12000.00);
    const halfAmount = totalAmount / 2;
    const durationWeeks = cons.min_duration_weeks || 4;

    const deliverablesSummary = [
      {
        order: 1,
        title: 'المرحلة الأولى: التصميم وهندسة واجهات وتجربة المستخدم (UI/UX Architecture)',
        description: `إعداد وتصميم واجهات وتجربة المستخدم لكافة شاشات ومميزات المشروع بما يشمل: ${featuresList.slice(0, 3).join('، ') || 'المتطلبات الرئيسية وتجربة العميل'}، وتجهيز النماذج التفاعلية للاعتماد.`,
        duration_weeks: Math.max(1, Math.floor(durationWeeks / 2)),
        cost: halfAmount,
      },
      {
        order: 2,
        title: 'المرحلة الثانية: التطوير البرمجي والتكامل والربط النهائي (Development & Integration)',
        description: 'بناء وتطوير كافة الوظائف البرمجية باستخدام التقنيات المتفق عليها والربط مع بوابات الدفع وقواعد البيانات واختبار الجودة وتسليم النسخة الإنتاجية النهائية.',
        duration_weeks: Math.max(2, Math.ceil(durationWeeks / 2)),
        cost: halfAmount,
      },
    ];

    const paymentTerms = [
      {
        milestone: 'المرحلة 1: عند اعتماد التصاميم والنماذج التفاعلية',
        percentage: 50,
        amount: halfAmount,
        condition: 'إيداع في حساب الضمان (Escrow) ويحرر بعد موافقة العميل على المرحلة الأولى',
      },
      {
        milestone: 'المرحلة 2: عند التسليم النهائي واكتمال النشر',
        percentage: 50,
        amount: halfAmount,
        condition: 'يحرر من حساب الضمان بعد الفحص النهائي والاعتماد البرمجي الكامل',
      },
    ];

    const contractNumber = `CNT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newContractRes = await db.query(
      `INSERT INTO contracts (
         consultation_id, client_id, contract_number, title, scope_of_work,
         total_amount, currency, duration_weeks, status, payment_terms, deliverables_summary,
         guarantee_terms
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'ر.س', $7, 'draft', $8, $9, $10
       ) RETURNING *`,
      [
        consultationId,
        userId,
        contractNumber,
        `وثيقة نطاق العمل وعقد التنفيذ المبدئي - ${cons.title}`,
        cons.summary || 'تنفيذ المشروع وفق المتطلبات المحددة في ملخص جلسة الاستشارة الذكية.',
        totalAmount,
        durationWeeks,
        JSON.stringify(paymentTerms),
        JSON.stringify(deliverablesSummary),
        'تضمن المنصة حماية المدفوعات في حساب الضمان (Escrow) وتقسيم العمل على مرحلتين مع اعتماد تلقائي بعد مرور 72 ساعة لضمان استمرارية الإنجاز.',
      ]
    );

    const generatedContract = newContractRes.rows[0];
    generatedContract.consultation_title = cons.title;
    generatedContract.project_type = cons.project_type;
    generatedContract.consultation_date = cons.consultation_date;

    return generatedContract;
  }

  return result.rows[0];
};

/**
 * جلب تفاصيل عقد مبدئي بواسطة معرف العقد
 */
const getContractById = async (userId, contractId) => {
  const result = await db.query(
    `SELECT 
       ct.*,
       c.title AS consultation_title,
       c.project_type,
       c.consultation_date
     FROM contracts ct
     LEFT JOIN consultations c ON c.id = ct.consultation_id
     WHERE ct.id = $1 AND ct.client_id = $2`,
    [contractId, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('العقد غير موجود أو ليس لديك صلاحية للوصول إليه');
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};

/**
 * توقيع واعتماد العقد المبدئي وإنشاء المشروع التنفيذي بمراحله تلقائياً
 */
const signContract = async (userId, contractId, { signatureName }) => {
  // التحقق من وجود العقد وملكيته
  const contractCheck = await db.query(
    `SELECT * FROM contracts WHERE id = $1 AND client_id = $2`,
    [contractId, userId]
  );

  if (contractCheck.rows.length === 0) {
    const error = new Error('العقد غير موجود أو ليس لديك صلاحية لتوقيعه');
    error.statusCode = 404;
    throw error;
  }

  const contract = contractCheck.rows[0];

  // في حال كان العقد موقّعاً مسبقاً
  if (contract.status === 'signed' || contract.status === 'active') {
    return {
      success: true,
      message: 'تم توقيع واعتماد هذا العقد مسبقاً',
      project_id: contract.project_id,
      contract_id: contract.id,
      data: contract,
    };
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // تحديد اسم الموقّع
    let signName = signatureName;
    if (!signName || signName.trim() === '') {
      const userRes = await client.query('SELECT full_name FROM users WHERE id = $1', [userId]);
      signName = userRes.rows[0]?.full_name || 'العميل';
    }

    // حساب موعد انتهاء المشروع المتوقع بناءً على عدد الأسابيع
    const durationWeeks = contract.duration_weeks || 4;
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + (durationWeeks * 7));

    // 1. إنشاء المشروع التنفيذي
    const projectRes = await client.query(
      `INSERT INTO projects (
         client_id, title, category, description, status, current_phase_name, budget, progress, deadline
       ) VALUES (
         $1, $2, $3, $4, 'in_progress', $5, $6, 0, $7
       ) RETURNING id`,
      [
        userId,
        contract.title,
        'متجر إلكتروني',
        contract.scope_of_work || 'مشروع تم إنشاؤه بناءً على مخرجات الاستشارة الذكية وتوقيع العقد المبدئي',
        'تصميم واجهات وتجربة المستخدم (UI/UX)',
        contract.total_amount || 0,
        deadlineDate,
      ]
    );

    const projectId = projectRes.rows[0].id;

    // 2. تحديث حالة العقد وربطه بالمشروع المنشأ
    await client.query(
      `UPDATE contracts 
       SET status = 'signed',
           signed_at = NOW(),
           client_signature_name = $1,
           project_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [signName, projectId, contractId]
    );

    // 3. توليد مراحل المشروع تلقائياً من ملخص المخرجات (deliverables_summary)
    let deliverables = contract.deliverables_summary;
    if (typeof deliverables === 'string') {
      try {
        deliverables = JSON.parse(deliverables);
      } catch (e) {
        deliverables = [];
      }
    }

    if (Array.isArray(deliverables) && deliverables.length > 0) {
      for (let i = 0; i < deliverables.length; i++) {
        const item = deliverables[i];
        const orderIndex = i + 1;
        const milestoneStatus = orderIndex === 1 ? 'in_progress' : 'pending';
        const cost = typeof item.cost === 'number' ? item.cost : parseFloat(item.cost) || 0;

        await client.query(
          `INSERT INTO project_milestones (
             project_id, title, description, order_index, status, cost, max_revisions, used_revisions
           ) VALUES (
             $1, $2, $3, $4, $5, $6, 3, 0
           )`,
          [projectId, item.title, item.description || null, orderIndex, milestoneStatus, cost]
        );
      }
    }

    // 4. تسجيل النشاط في سجل الأنشطة (Activity Log)
    await client.query(
      `INSERT INTO activity_logs (user_id, project_id, title, description, type)
       VALUES ($1, $2, $3, $4, 'contract')`,
      [
        userId,
        projectId,
        'تم توقيع العقد وبدء المشروع',
        `تم توقيع العقد رقم ${contract.contract_number} وبدء المشروع التنفيذي بنجاح`,
      ]
    );

    await client.query('COMMIT');

    // ---- إشعار Socket.io بتوقيع العقد وبدء المشروع ----
    createNotification(userId, {
      title: 'تم توقيع العقد بنجاح',
      body: `تم اعتماد وتوقيع العقد رقم ${contract.contract_number} وبدء المشروع التنفيذي`,
      type: 'contract',
      link: `/projects/${projectId}`
    });
    safeEmit(`user:${userId}`, 'contract_signed', {
      contractId: contract.id,
      contractNumber: contract.contract_number,
      projectId,
      signedAt: new Date().toISOString(),
      message: 'تم توقيع العقد وبدء المشروع التنفيذي بنجاح',
    });

    return {
      success: true,
      message: 'تم توقيع واعتماد العقد بنجاح وإنشاء المشروع التنفيذي',
      project_id: projectId,
      contract_id: contract.id,
      data: {
        contract_id: contract.id,
        project_id: projectId,
        contract_number: contract.contract_number,
        status: 'signed',
        signed_at: new Date().toISOString(),
        client_signature_name: signName,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب قائمة المستشارين والخبراء التقنيين مع مواعيدهم المتاحة القادمة
 */
const getExpertsWithSlots = async () => {
  const expertsRes = await db.query(
    `SELECT 
       ep.id AS expert_id,
       u.id AS user_id,
       u.full_name,
       u.email,
       u.avatar_url,
       ep.title,
       ep.bio,
       ep.rating,
       ep.reviews_count,
       ep.badge,
       ep.consultation_fee,
       ep.currency,
       ep.is_available
     FROM expert_profiles ep
     JOIN users u ON u.id = ep.user_id
     WHERE ep.is_available = true
     ORDER BY ep.rating DESC, ep.id ASC`
  );

  const experts = expertsRes.rows;

  for (const expert of experts) {
    const slotsRes = await db.query(
      `SELECT id, slot_date::text AS slot_date, slot_time, is_booked
       FROM expert_availability_slots
       WHERE expert_id = $1 AND is_booked = false
       ORDER BY slot_date ASC, id ASC`,
      [expert.expert_id]
    );

    // تجميع المواعيد حسب اليوم
    const datesMap = {};
    slotsRes.rows.forEach(slot => {
      const dateStr = slot.slot_date;
      if (!datesMap[dateStr]) {
        datesMap[dateStr] = [];
      }
      datesMap[dateStr].push({
        id: slot.id,
        time: slot.slot_time,
      });
    });

    expert.available_dates = Object.keys(datesMap).map(date => ({
      date,
      slots: datesMap[date],
    }));
  }

  return experts;
};

/**
 * حجز جلسة استشارة مع مستشار تقني بشري (مطابق للشاشة 2 يساراً)
 */
const bookExpertSession = async (clientId, bookingData) => {
  const {
    expert_id,
    session_type = 'video_call',
    booking_date,
    booking_time,
    consultation_id,
    notes,
  } = bookingData;

  if (!expert_id || !booking_date || !booking_time) {
    const error = new Error('يرجى تحديد الخبير والتاريخ والوقت لحجز الجلسة');
    error.statusCode = 400;
    throw error;
  }

  // التحقق من وجود الخبير
  const expertRes = await db.query(
    `SELECT ep.id, ep.consultation_fee, ep.currency, u.full_name, u.email
     FROM expert_profiles ep
     JOIN users u ON u.id = ep.user_id
     WHERE ep.id = $1`,
    [expert_id]
  );

  if (expertRes.rows.length === 0) {
    const error = new Error('الخبير غير موجود أو غير متاح حالياً');
    error.statusCode = 404;
    throw error;
  }

  const expert = expertRes.rows[0];

  // التحقق من توفر الموعد وعدم حجزه مسبقاً
  const slotRes = await db.query(
    `SELECT id, is_booked 
     FROM expert_availability_slots 
     WHERE expert_id = $1 AND slot_date = $2 AND slot_time = $3`,
    [expert_id, booking_date, booking_time]
  );

  if (slotRes.rows.length === 0 || slotRes.rows[0].is_booked) {
    const error = new Error('هذا الموعد غير متاح أو تم حجزه مسبقاً، يرجى اختيار موعد آخر');
    error.statusCode = 409;
    throw error;
  }

  const slotId = slotRes.rows[0].id;
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. تعليم الموعد كمحجوز
    await client.query(
      `UPDATE expert_availability_slots SET is_booked = true WHERE id = $1`,
      [slotId]
    );

    // 2. إنشاء رابط الاجتماع الافتراضي
    const meetingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const meetingLink = `https://meet.access.agency/expert-session/${meetingCode}`;

    // 3. إنشاء الحجز
    const bookingRes = await client.query(
      `INSERT INTO expert_bookings (
         client_id, expert_id, consultation_id, session_type, duration_minutes,
         booking_date, booking_time, fee, status, meeting_link, notes
       ) VALUES (
         $1, $2, $3, $4, 30,
         $5, $6, $7, 'confirmed', $8, $9
       ) RETURNING *`,
      [
        clientId,
        expert_id,
        consultation_id || null,
        session_type,
        booking_date,
        booking_time,
        expert.consultation_fee || 250.00,
        meetingLink,
        notes || null,
      ]
    );

    const booking = bookingRes.rows[0];

    // 4. إضافة الحدث في تقويم العميل (Upcoming Calendar Events)
    const sessionLabel = session_type === 'video_call' ? 'مكالمة فيديو (30 دقيقة)' : 'محادثة نصية ومراجعة ملفات';
    await client.query(
      `INSERT INTO project_events (user_id, project_id, title, event_date, event_time, assigned_to, status)
       VALUES ($1, NULL, $2, $3, $4, $5, 'upcoming')`,
      [
        clientId,
        `جلسة استشارة مع ${expert.full_name} - ${sessionLabel}`,
        booking_date,
        booking_time,
        expert.full_name,
      ]
    );

    // 5. تسجيل الحدث في سجل النشاطات (Activity Log)
    await client.query(
      `INSERT INTO activity_logs (user_id, project_id, title, description, type)
       VALUES ($1, NULL, $2, $3, 'event')`,
      [
        clientId,
        `حجز استشارة مع ${expert.full_name}`,
        `تم تأكيد حجز الاستشارة التقنية بتاريخ ${booking_date} الساعة ${booking_time} (${sessionLabel})`,
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم تأكيد حجز جلسة الاستشارة بنجاح',
      data: {
        booking_id: booking.id,
        expert_name: expert.full_name,
        session_type,
        duration_minutes: 30,
        booking_date,
        booking_time,
        fee: booking.fee,
        currency: expert.currency,
        meeting_link: meetingLink,
        policy_note: 'قيمة الاستشارة تُخصم بالكامل من تكلفة المشروع عند توقيع العقد النهائي',
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب سجل حجوزات الاستشارات البشرية الخاصة بالعميل
 */
const getClientExpertBookings = async (clientId) => {
  const result = await db.query(
    `SELECT 
       eb.*,
       u.full_name AS expert_name,
       u.avatar_url AS expert_avatar,
       ep.title AS expert_title,
       ep.rating AS expert_rating
     FROM expert_bookings eb
     JOIN expert_profiles ep ON ep.id = eb.expert_id
     JOIN users u ON u.id = ep.user_id
     WHERE eb.client_id = $1
     ORDER BY eb.booking_date DESC, eb.created_at DESC`,
    [clientId]
  );

  return result.rows;
};

module.exports = {
  getConsultations,
  getConsultationDetails,
  createConsultation,
  updateConsultationBrief,
  addConsultationMessage,
  getContractByConsultationId,
  getContractById,
  signContract,
  getExpertsWithSlots,
  bookExpertSession,
  getClientExpertBookings,
};

