const db = require('../../config/db');

const getProjects = async (userId, filterStatus) => {
  // 1. جلب إحصائيات الفلاتر لتبويبات الواجهة: الكل (5)، قيد التنفيذ (2)، بانتظار المراجعة (1)، المكتملة (2)
  const countsQuery = await db.query(
    `SELECT 
       COUNT(*)::int AS all_count,
       COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
       COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review_count,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count
     FROM projects
     WHERE client_id = $1`,
    [userId]
  );

  const counts = countsQuery.rows[0] || {
    all_count: 0,
    in_progress_count: 0,
    under_review_count: 0,
    completed_count: 0,
  };

  // 2. تصفية المشاريع حسب الـ filter المختار
  let whereClause = 'WHERE p.client_id = $1';
  const queryParams = [userId];

  if (filterStatus && filterStatus !== 'all') {
    queryParams.push(filterStatus);
    whereClause += ` AND p.status = $${queryParams.length}`;
  }

  const projectsQuery = await db.query(
    `SELECT 
       p.id,
       p.title,
       p.category,
       p.description,
       p.status,
       p.current_phase_name,
       p.budget,
       p.progress,
       TO_CHAR(p.deadline, 'YYYY-MM-DD') AS deadline,
       TO_CHAR(p.deadline, 'DD Mon') AS deadline_formatted,
       p.created_at,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'job_title', u.job_title,
         'avatar_url', u.avatar_url
       ) AS team_leader,
       (
         SELECT COUNT(*)::int 
         FROM project_milestones pm 
         WHERE pm.project_id = p.id
       ) AS milestones_count,
       (
         SELECT COUNT(*)::int 
         FROM final_deliverables fd 
         WHERE fd.project_id = p.id
       ) AS deliverables_count
     FROM projects p
     LEFT JOIN users u ON u.id = p.team_leader_id
     ${whereClause}
     ORDER BY 
       CASE 
         WHEN p.status = 'under_review' THEN 1
         WHEN p.status = 'in_progress' THEN 2
         ELSE 3
       END,
       p.created_at DESC`,
    queryParams
  );

  return {
    counts: {
      all: counts.all_count,
      in_progress: counts.in_progress_count,
      under_review: counts.under_review_count,
      completed: counts.completed_count,
    },
    projects: projectsQuery.rows,
  };
};

const getProjectById = async (userId, projectId) => {
  // جلب تفاصيل المشروع الأساسية
  const projectRes = await db.query(
    `SELECT 
       p.id,
       p.client_id,
       p.title,
       p.category,
       p.description,
       p.status,
       p.current_phase_name,
       p.budget,
       p.progress,
       TO_CHAR(p.deadline, 'YYYY-MM-DD') AS deadline,
       TO_CHAR(p.deadline, 'DD Mon') AS deadline_formatted,
       p.auto_approval_deadline,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'email', u.email,
         'job_title', u.job_title,
         'avatar_url', u.avatar_url
       ) AS team_leader
     FROM projects p
     LEFT JOIN users u ON u.id = p.team_leader_id
     WHERE p.id = $1 AND p.client_id = $2`,
    [projectId, userId]
  );

  if (projectRes.rows.length === 0) {
    const error = new Error('المشروع غير موجود أو ليس لديك صلاحية للوصول إليه');
    error.statusCode = 404;
    throw error;
  }

  const project = projectRes.rows[0];

  // جلب مراحل خريطة الإنجاز (Milestones)
  const milestonesRes = await db.query(
    `SELECT 
       pm.id,
       pm.title,
       pm.description,
       pm.order_index,
       pm.status,
       pm.cost,
       pm.max_revisions,
       pm.used_revisions,
       (pm.max_revisions - pm.used_revisions) AS remaining_revisions,
       TO_CHAR(pm.due_date, 'YYYY-MM-DD') AS due_date,
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
             'status', md.status
           )
         )
         FROM milestone_deliverables md
         WHERE md.milestone_id = pm.id
       ) AS deliverables
     FROM project_milestones pm
     WHERE pm.project_id = $1
     ORDER BY pm.order_index ASC`,
    [projectId]
  );

  // جلب أعضاء الفريق المشاركين
  const membersRes = await db.query(
    `SELECT 
       u.id,
       u.full_name,
       u.avatar_url,
       u.job_title,
       pm.role_in_project
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1`,
    [projectId]
  );

  // جلب ملفات التسليم النهائي
  const finalDeliverablesRes = await db.query(
    `SELECT id, title, file_url, file_size, file_type
     FROM final_deliverables
     WHERE project_id = $1
     ORDER BY id ASC`,
    [projectId]
  );

  // جلب آخر نشاطات المشروع
  const activitiesRes = await db.query(
    `SELECT id, title, description, type, created_at
     FROM activity_logs
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [projectId]
  );

  return {
    ...project,
    milestones: milestonesRes.rows,
    team_members: membersRes.rows,
    final_deliverables: finalDeliverablesRes.rows,
    recent_activities: activitiesRes.rows,
  };
};

const createProject = async (userId, data) => {
  const { title, category, description, budget, deadline } = data;

  const result = await db.query(
    `INSERT INTO projects (client_id, title, category, description, budget, deadline, status, progress)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', 0)
     RETURNING id, title, category, description, budget, deadline, status, progress, created_at`,
    [userId, title, category, description, budget || 0.0, deadline || null]
  );

  const newProject = result.rows[0];

  // تسجيل النشاط
  await db.query(
    `INSERT INTO activity_logs (user_id, project_id, title, description, type)
     VALUES ($1, $2, 'تم إنشاء مشروع جديد', $3, 'system')`,
    [userId, newProject.id, `تم إنشاء المشروع بنجاح: ${newProject.title}`]
  );

  return newProject;
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
};
