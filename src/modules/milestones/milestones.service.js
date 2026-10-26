const db = require('../../config/db');

const getMilestoneReview = async (userId, milestoneId) => {
  const result = await db.query(
    `SELECT 
       pm.id,
       pm.project_id,
       pm.title,
       pm.description,
       pm.order_index,
       pm.status,
       pm.cost,
       pm.max_revisions,
       pm.used_revisions,
       (pm.max_revisions - pm.used_revisions) AS remaining_revisions,
       p.title AS project_title,
       p.progress AS project_progress,
       p.auto_approval_deadline,
       TO_CHAR(p.auto_approval_deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS auto_approval_iso,
       TO_CHAR(pm.due_date, 'YYYY-MM-DD') AS due_date,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'avatar_url', u.avatar_url,
         'job_title', u.job_title
       ) AS team_leader,
       (
         SELECT json_agg(
           json_build_object(
             'id', md.id,
             'title', md.title,
             'file_url', md.file_url,
             'file_size', md.file_size,
             'file_type', md.file_type,
             'preview_image_url', md.preview_image_url,
             'version', md.version,
             'client_notes', md.client_notes,
             'status', md.status
           )
         )
         FROM milestone_deliverables md
         WHERE md.milestone_id = pm.id
       ) AS deliverables
     FROM project_milestones pm
     JOIN projects p ON p.id = pm.project_id
     LEFT JOIN users u ON u.id = p.team_leader_id
     WHERE pm.id = $1 AND p.client_id = $2`,
    [milestoneId, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('المرحلة غير موجودة أو ليس لديك صلاحية لمراجعتها');
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};

const requestChanges = async (userId, milestoneId, { notes }) => {
  const check = await db.query(
    `SELECT pm.id, pm.project_id, pm.title, pm.max_revisions, pm.used_revisions, p.client_id
     FROM project_milestones pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.id = $1 AND p.client_id = $2`,
    [milestoneId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('المرحلة غير موجودة');
    error.statusCode = 404;
    throw error;
  }

  const milestone = check.rows[0];

  if (milestone.used_revisions >= milestone.max_revisions) {
    const error = new Error('تم استنفاد جميع جولات التعديل المجانية المتاحة لهذه المرحلة');
    error.statusCode = 400;
    throw error;
  }

  const newUsed = milestone.used_revisions + 1;
  const remaining = milestone.max_revisions - newUsed;

  // تحديث المرحلة وحفظ الملاحظات
  await db.query(
    `UPDATE project_milestones 
     SET used_revisions = $1, status = 'in_progress', updated_at = NOW() 
     WHERE id = $2`,
    [newUsed, milestoneId]
  );

  // تحديث ملاحظات المخرج
  await db.query(
    `UPDATE milestone_deliverables
     SET client_notes = $1, status = 'changes_requested'
     WHERE milestone_id = $2`,
    [notes, milestoneId]
  );

  // تحديث حالة المشروع إلى قيد التنفيذ
  await db.query(
    `UPDATE projects SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
    [milestone.project_id]
  );

  // تسجيل النشاط
  await db.query(
    `INSERT INTO activity_logs (user_id, project_id, title, description, type)
     VALUES ($1, $2, 'طلب تعديل على مخرجات المرحلة', $3, 'deliverable')`,
    [userId, milestone.project_id, `تم إرسال ملاحظات العميل على مرحلة: ${milestone.title}`]
  );

  return {
    message: 'تم إرسال الملاحظات بنجاح إلى قائد الفريق',
    used_revisions: newUsed,
    remaining_revisions: remaining,
  };
};

const approveMilestone = async (userId, milestoneId) => {
  const check = await db.query(
    `SELECT pm.id, pm.project_id, pm.title, pm.order_index, p.client_id
     FROM project_milestones pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.id = $1 AND p.client_id = $2`,
    [milestoneId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('المرحلة غير موجودة');
    error.statusCode = 404;
    throw error;
  }

  const milestone = check.rows[0];
  const projectId = milestone.project_id;

  // 1. اعتماد المرحلة الحالية
  await db.query(
    `UPDATE project_milestones SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [milestoneId]
  );

  await db.query(
    `UPDATE milestone_deliverables SET status = 'approved' WHERE milestone_id = $1`,
    [milestoneId]
  );

  // 2. حساب نسبة الإنجاز الجديدة للمشروع
  const countsRes = await db.query(
    `SELECT 
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM project_milestones
     WHERE project_id = $1`,
    [projectId]
  );

  const total = countsRes.rows[0].total;
  const completed = countsRes.rows[0].completed;
  const newProgress = Math.round((completed / total) * 100);

  // 3. التحقق إذا كانت هناك مرحلة تالية لتفعيلها
  const nextMilestoneRes = await db.query(
    `SELECT id, title FROM project_milestones 
     WHERE project_id = $1 AND order_index > $2 AND status = 'pending'
     ORDER BY order_index ASC LIMIT 1`,
    [projectId, milestone.order_index]
  );

  let nextPhaseName = null;
  let newProjectStatus = 'in_progress';

  if (nextMilestoneRes.rows.length > 0) {
    const nextMilestone = nextMilestoneRes.rows[0];
    nextPhaseName = nextMilestone.title;
    await db.query(
      `UPDATE project_milestones SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [nextMilestone.id]
    );
  } else if (completed === total) {
    // جميع المراحل اكتملت -> الانتقال إلى التسليم النهائي
    newProjectStatus = 'final_delivery';
    nextPhaseName = 'التسليم النهائي واعتماد المشروع';
  }

  await db.query(
    `UPDATE projects 
     SET progress = $1, status = $2, current_phase_name = COALESCE($3, current_phase_name), updated_at = NOW()
     WHERE id = $4`,
    [newProgress, newProjectStatus, nextPhaseName, projectId]
  );

  // تسجيل النشاط
  await db.query(
    `INSERT INTO activity_logs (user_id, project_id, title, description, type)
     VALUES ($1, $2, 'تم اعتماد مخرجات المرحلة', $3, 'milestone')`,
    [userId, projectId, `اعتمد العميل مخرجات مرحلة: ${milestone.title}`]
  );

  return {
    message: 'تم اعتماد مخرجات المرحلة بنجاح',
    progress: newProgress,
    project_status: newProjectStatus,
    current_phase_name: nextPhaseName,
  };
};

const getFinalDelivery = async (userId, projectId) => {
  const check = await db.query(
    `SELECT 
       p.id, 
       p.title, 
       p.category, 
       p.budget, 
       p.status, 
       p.progress,
       p.auto_approval_deadline,
       TO_CHAR(p.auto_approval_deadline, 'YYYY-MM-DD"T"HH24:MI:SS') AS auto_approval_iso,
       w.escrow_balance,
       w.available_balance
     FROM projects p
     LEFT JOIN wallets w ON w.user_id = p.client_id
     WHERE p.id = $1 AND p.client_id = $2`,
    [projectId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('المشروع غير موجود أو ليس لديك صلاحية للوصول إليه');
    error.statusCode = 404;
    throw error;
  }

  const project = check.rows[0];

  const deliverablesRes = await db.query(
    `SELECT id, title, file_url, file_size, file_type
     FROM final_deliverables
     WHERE project_id = $1
     ORDER BY id ASC`,
    [projectId]
  );

  return {
    project: {
      id: project.id,
      title: project.title,
      category: project.category,
      budget: project.budget,
      status: project.status,
      progress: project.progress,
      auto_approval_deadline: project.auto_approval_deadline,
      auto_approval_iso: project.auto_approval_iso,
      escrow_release_amount: project.budget,
    },
    deliverables: deliverablesRes.rows,
  };
};

const finalSignoff = async (userId, projectId) => {
  const check = await db.query(
    `SELECT id, title, budget FROM projects WHERE id = $1 AND client_id = $2`,
    [projectId, userId]
  );

  if (check.rows.length === 0) {
    const error = new Error('المشروع غير موجود أو ليس لديك صلاحية لاعتماده');
    error.statusCode = 404;
    throw error;
  }

  const project = check.rows[0];

  // 1. تحويل المشروع لمكتمل
  await db.query(
    `UPDATE projects 
     SET status = 'completed', progress = 100, current_phase_name = 'تم التسليم والاعتماد بنجاح', updated_at = NOW() 
     WHERE id = $1`,
    [projectId]
  );

  // 2. تحديث محفظة العميل (خصم المعلق وزيادة المنفق)
  await db.query(
    `UPDATE wallets 
     SET escrow_balance = GREATEST(0, escrow_balance - $1),
         total_spent = total_spent + $1,
         updated_at = NOW()
     WHERE user_id = $2`,
    [project.budget, userId]
  );

  // 3. تسجيل النشاط
  await db.query(
    `INSERT INTO activity_logs (user_id, project_id, title, description, type)
     VALUES ($1, $2, 'تم اعتماد التسليم النهائي للمشروع', $3, 'system')`,
    [userId, projectId, `تم استلام وتحميل كافة ملفات مشروع ${project.title} بنجاح وتحرير المستحقات`]
  );

  return {
    message: 'تم اعتماد التسليم النهائي للمشروع بنجاح وتحرير المستحقات',
    project_status: 'completed',
    progress: 100,
  };
};

module.exports = {
  getMilestoneReview,
  requestChanges,
  approveMilestone,
  getFinalDelivery,
  finalSignoff,
};
