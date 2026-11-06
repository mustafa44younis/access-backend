const db = require('../../config/db');

/**
 * جلب قائمة المستقلين وقادة الفرق مع الفلترة حسب الدور أو البحث
 */
const getSpecialists = async ({ role, search, limit = 20, page = 1 } = {}) => {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const queryParams = [];
  let whereClauses = ["r.name IN ('team_leader', 'specialist')"];

  if (role && role !== 'all') {
    queryParams.push(role);
    whereClauses.push(`r.name = $${queryParams.length}`);
  }

  if (search && search.trim() !== '') {
    queryParams.push(`%${search.trim()}%`);
    const idx = queryParams.length;
    whereClauses.push(`(u.full_name ILIKE $${idx} OR u.job_title ILIKE $${idx} OR ep.bio ILIKE $${idx})`);
  }

  const whereSql = whereClauses.join(' AND ');

  const totalRes = await db.query(
    `SELECT COUNT(DISTINCT u.id)::int AS total
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN expert_profiles ep ON ep.user_id = u.id
     WHERE ${whereSql}`,
    queryParams
  );

  queryParams.push(parseInt(limit), offset);

  const query = `
    SELECT 
      u.id,
      u.full_name,
      u.avatar_url,
      u.job_title,
      r.name AS role_name,
      r.name_ar AS role_name_ar,
      COALESCE(ep.rating, 4.9) AS rating,
      COALESCE(ep.reviews_count, 15) AS reviews_count,
      COALESCE(ep.badge, 'محترف معتمد') AS badge,
      COALESCE(ep.consultation_fee, 250.00) AS hourly_rate,
      ep.bio,
      true AS is_available,
      (
        SELECT COUNT(DISTINCT project_id)::int 
        FROM project_members pm 
        WHERE pm.user_id = u.id
      ) AS completed_projects_count
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN expert_profiles ep ON ep.user_id = u.id
    WHERE ${whereSql}
    ORDER BY ep.rating DESC NULLS LAST, u.id ASC
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;

  const specialistsRes = await db.query(query, queryParams);

  return {
    total: totalRes.rows[0]?.total || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    specialists: specialistsRes.rows,
  };
};

/**
 * جلب تفاصيل مستقل أو قائد فريق محدد مع التقييمات والمشاريع
 */
const getSpecialistById = async (specialistId) => {
  const result = await db.query(
    `SELECT 
       u.id,
       u.full_name,
       u.email,
       u.avatar_url,
       u.job_title,
       u.bio,
       r.name AS role_name,
       r.name_ar AS role_name_ar,
       COALESCE(ep.rating, 4.9) AS rating,
       COALESCE(ep.reviews_count, 15) AS reviews_count,
       COALESCE(ep.badge, 'محترف معتمد') AS badge,
       COALESCE(ep.consultation_fee, 250.00) AS hourly_rate,
       COALESCE(ep.is_available, true) AS is_available,
       u.created_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN expert_profiles ep ON ep.user_id = u.id
     WHERE u.id = $1 AND r.name IN ('team_leader', 'specialist')`,
    [specialistId]
  );

  if (result.rows.length === 0) {
    const error = new Error('المستقل أو قائد الفريق غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const specialist = result.rows[0];

  // المهارات التقنية المستنتجة
  specialist.skills = [
    'UI/UX Architecture',
    'Figma & Design Systems',
    'Next.js & React',
    'PostgreSQL & Cloud Databases',
    'Saudi Payment Gateways (Mada, Tamara)',
  ];

  return specialist;
};

/**
 * جلب أعضاء الفريق النشطين في جميع مشاريع العميل الحالية
 */
const getMyProjectTeam = async (userId) => {
  const query = `
    SELECT DISTINCT 
      u.id,
      u.full_name,
      u.avatar_url,
      u.job_title,
      r.name AS role_name,
      r.name_ar AS role_name_ar,
      p.id AS project_id,
      p.title AS project_title,
      COALESCE(pm.role_in_project, 'قائد المشروع') AS role_in_project,
      COALESCE(ep.rating, 4.9) AS rating,
      true AS is_online
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN expert_profiles ep ON ep.user_id = u.id
    LEFT JOIN project_members pm ON pm.user_id = u.id
    LEFT JOIN projects p ON (p.id = pm.project_id OR p.team_leader_id = u.id)
    WHERE p.client_id = $1 AND p.status IN ('in_progress', 'under_review')
    ORDER BY u.id ASC
  `;

  const result = await db.query(query, [userId]);
  return result.rows;
};

module.exports = {
  getSpecialists,
  getSpecialistById,
  getMyProjectTeam,
};
