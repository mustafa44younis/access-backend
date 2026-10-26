const db = require('../../config/db');

const getOverview = async (userId) => {
  // 1. الإحصائيات الأربع العلوية
  const statsRes = await db.query(
    `SELECT 
       COUNT(*) FILTER (WHERE status IN ('in_progress', 'under_review'))::int AS active_projects_count,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_projects_count
     FROM projects
     WHERE client_id = $1`,
    [userId]
  );

  const walletRes = await db.query(
    `SELECT available_balance, escrow_balance, total_spent 
     FROM wallets 
     WHERE user_id = $1`,
    [userId]
  );

  const wallet = walletRes.rows[0] || {
    available_balance: '0.00',
    escrow_balance: '0.00',
    total_spent: '0.00',
  };

  const stats = {
    active_projects: statsRes.rows[0]?.active_projects_count || 0,
    completed_projects: statsRes.rows[0]?.completed_projects_count || 0,
    total_spent: Number(wallet.total_spent),
    wallet_balance: Number(wallet.available_balance),
    escrow_balance: Number(wallet.escrow_balance),
  };

  // 2. قائمة المشاريع النشطة (المشاريع الجارية)
  const activeProjectsRes = await db.query(
    `SELECT 
       p.id,
       p.title,
       p.category,
       p.status,
       p.current_phase_name,
       p.progress,
       TO_CHAR(p.deadline, 'YYYY-MM-DD') AS deadline,
       TO_CHAR(p.deadline, 'DD Mon') AS deadline_formatted,
       json_build_object(
         'id', u.id,
         'full_name', u.full_name,
         'avatar_url', u.avatar_url
       ) AS team_leader
     FROM projects p
     LEFT JOIN users u ON u.id = p.team_leader_id
     WHERE p.client_id = $1 AND p.status IN ('in_progress', 'under_review')
     ORDER BY p.progress DESC
     LIMIT 5`,
    [userId]
  );

  // 3. المواعيد القادمة في التقويم
  const eventsRes = await db.query(
    `SELECT 
       id,
       title,
       TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date,
       TO_CHAR(event_date, 'DD') AS event_day,
       TO_CHAR(event_date, 'Mon') AS event_month,
       event_time,
       assigned_to
     FROM project_events
     WHERE user_id = $1
     ORDER BY event_date ASC
     LIMIT 5`,
    [userId]
  );

  // 4. فريقك النشط (الأعضاء في مشاريع العميل)
  const teamRes = await db.query(
    `SELECT DISTINCT 
       u.id,
       u.full_name,
       u.avatar_url,
       u.job_title,
       true AS is_online
     FROM users u
     WHERE u.id IN (
       SELECT team_leader_id FROM projects WHERE client_id = $1 AND team_leader_id IS NOT NULL
       UNION
       SELECT pm.user_id FROM project_members pm 
       JOIN projects p ON p.id = pm.project_id 
       WHERE p.client_id = $1
     )
     LIMIT 6`,
    [userId]
  );

  // 5. آخر النشاطات
  const activitiesRes = await db.query(
    `SELECT 
       id,
       title,
       description,
       type,
       created_at,
       TO_CHAR(created_at, 'HH12:MI AM') AS time_formatted
     FROM activity_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );

  // 6. التنبيه السياقي الخاص بمراجعة المخرجات (إن وجد)
  const pendingReviewProject = activeProjectsRes.rows.find(p => p.status === 'under_review');
  const alertBanner = pendingReviewProject
    ? {
        show: true,
        projectId: pendingReviewProject.id,
        message: `دليل ${pendingReviewProject.title} جاهز لاعتمادك، مراجعتك تساعد الفريق على التقدم.`,
        buttonText: 'مراجعة المخرجات',
      }
    : null;

  return {
    stats,
    alert_banner: alertBanner,
    active_projects: activeProjectsRes.rows,
    upcoming_events: eventsRes.rows,
    active_team: teamRes.rows,
    recent_activities: activitiesRes.rows,
  };
};

module.exports = {
  getOverview,
};
