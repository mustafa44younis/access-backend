const db = require('../config/db');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    console.log('🌱 Seeding demo data matching UI designs...');

    // 1. جلب أول عميل مسجل في قاعدة البيانات
    const clientRes = await db.query(
      `SELECT u.id, u.full_name, u.email 
       FROM users u 
       JOIN roles r ON r.id = u.role_id 
       WHERE r.name = 'client' 
       ORDER BY u.id ASC LIMIT 1`
    );

    if (clientRes.rows.length === 0) {
      console.log('⚠️ No client found. Please register a client user first.');
      process.exit(0);
    }

    const client = clientRes.rows[0];
    console.log(`👤 Using client: ${client.full_name} (ID: ${client.id})`);

    // 2. جلب role_id لكل دور
    const rolesRes = await db.query('SELECT id, name FROM roles');
    const roleMap = {};
    rolesRes.rows.forEach(r => { roleMap[r.name] = r.id; });

    // 3. إنشاء أو تحديث قادة الفرق والمتخصصين
    const defaultPassword = await bcrypt.hash('TeamPass123!', 10);

    const teamMembersData = [
      {
        fullName: 'أحمد السالم',
        email: 'ahmed.salem@access.demo',
        jobTitle: 'قائد التطوير - سلة الخير',
        role: 'team_leader',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
      },
      {
        fullName: 'سارة القحطاني',
        email: 'sara.qahtani@access.demo',
        jobTitle: 'قائدة التصميم - نواة',
        role: 'team_leader',
        avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&h=200&q=80',
      },
      {
        fullName: 'خالد الحربي',
        email: 'khaled.harbi@access.demo',
        jobTitle: 'قائد المنتج - موعد',
        role: 'team_leader',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
      },
      {
        fullName: 'نورة الدوسري',
        email: 'noura.dossary@access.demo',
        jobTitle: 'مطورة واجهات - سلة الخير',
        role: 'specialist',
        avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&h=200&q=80',
      },
    ];

    const teamUserIds = {};

    for (const member of teamMembersData) {
      const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [member.email]);
      let uid;
      if (userCheck.rows.length > 0) {
        uid = userCheck.rows[0].id;
        await db.query(
          'UPDATE users SET full_name = $1, job_title = $2, avatar_url = $3, is_email_verified = true WHERE id = $4',
          [member.fullName, member.jobTitle, member.avatarUrl, uid]
        );
      } else {
        const insertUser = await db.query(
          `INSERT INTO users (full_name, email, password, role_id, is_active, is_email_verified, job_title, avatar_url)
           VALUES ($1, $2, $3, $4, true, true, $5, $6)
           RETURNING id`,
          [member.fullName, member.email, defaultPassword, roleMap[member.role] || roleMap['specialist'], member.jobTitle, member.avatarUrl]
        );
        uid = insertUser.rows[0].id;
      }
      teamUserIds[member.fullName] = uid;
    }

    // 4. إعداد محفظة العميل
    await db.query(
      `INSERT INTO wallets (user_id, available_balance, escrow_balance, total_spent)
       VALUES ($1, 12500.00, 4500.00, 41500.00)
       ON CONFLICT (user_id) 
       DO UPDATE SET available_balance = 12500.00, escrow_balance = 4500.00, total_spent = 41500.00`,
      [client.id]
    );

    // 5. مسح المشاريع القديمة للعميل لإعادة بنائها مطابقة للتصميم
    await db.query('DELETE FROM projects WHERE client_id = $1', [client.id]);

    // المشروع 1: متجر سلة الخير
    const p1 = await db.query(
      `INSERT INTO projects (client_id, team_leader_id, title, category, description, status, current_phase_name, budget, progress, deadline)
       VALUES ($1, $2, 'متجر سلة الخير', 'تطوير متجر إلكتروني', 'تطوير متجر إلكتروني متكامل للبيع بالتجزئة مع نظام مدفوعات سريع', 'in_progress', 'تطوير واجهات المتجر', 15000.00, 65, '2026-10-22')
       RETURNING id`,
      [client.id, teamUserIds['أحمد السالم']]
    );

    // المشروع 2: هوية نواة (المشروع الرئيسي في شاشة التفاصيل والمراجعة والتسليم)
    const p2 = await db.query(
      `INSERT INTO projects (client_id, team_leader_id, title, category, description, status, current_phase_name, budget, progress, deadline, auto_approval_deadline)
       VALUES ($1, $2, 'هوية نواة', 'تصميم الهوية البصرية', 'بناء وتطوير دليل الهوية البصرية والشعار وكافة الأصول البصرية', 'under_review', 'اعتماد دليل الهوية', 4500.00, 90, '2026-10-18', NOW() + INTERVAL '45 hours 12 minutes')
       RETURNING id`,
      [client.id, teamUserIds['سارة القحطاني']]
    );

    // المشروع 3: تطبيق موعد
    const p3 = await db.query(
      `INSERT INTO projects (client_id, team_leader_id, title, category, description, status, current_phase_name, budget, progress, deadline)
       VALUES ($1, $2, 'تطبيق موعد', 'تصميم تجربة المستخدم', 'تصميم واجهات وتجربة المستخدم لتطبيق حجز المواعيد الطبية', 'in_progress', 'تصميم تجربة المستخدم', 8000.00, 35, '2026-10-25')
       RETURNING id`,
      [client.id, teamUserIds['خالد الحربي']]
    );

    // مشروعين مكتملين للعميل لتكون إحصائية المشاريع المكتملة = 2
    await db.query(
      `INSERT INTO projects (client_id, team_leader_id, title, category, description, status, budget, progress, deadline)
       VALUES 
       ($1, $2, 'منصة تعليمية ذكية', 'تطوير منصات ويب', 'منصة دورات تدريبية واختبارات تفاعلية', 'completed', 8000.00, 100, '2026-08-15'),
       ($1, $3, 'نظام إدارة المخزون', 'أنظمة برمجية', 'نظام إدارة ومتابعة الفواتير والمخزون السحابي', 'completed', 6000.00, 100, '2026-09-01')`,
      [client.id, teamUserIds['أحمد السالم'], teamUserIds['خالد الحربي']]
    );

    const noaaProjectId = p2.rows[0].id;
    const sallaProjectId = p1.rows[0].id;
    const mowedProjectId = p3.rows[0].id;

    // 6. إضافة مراحل مشروع "هوية نواة" (خريطة الإنجاز في التصميم)
    const m1 = await db.query(
      `INSERT INTO project_milestones (project_id, title, description, order_index, status, cost)
       VALUES ($1, 'جلسة الاستكشاف وبناء المود بورد', 'تحديد الرسالة البصرية وجمع المراجع وتحليل المنافسين', 1, 'completed', 1000.00)
       RETURNING id`,
      [noaaProjectId]
    );

    const m2 = await db.query(
      `INSERT INTO project_milestones (project_id, title, description, order_index, status, cost)
       VALUES ($1, 'تصميم مفاهيم الشعار المبدئية', 'ابتكار 3 خيارات فريدة لشعار العلامة التجارية', 2, 'completed', 1500.00)
       RETURNING id`,
      [noaaProjectId]
    );

    const m3 = await db.query(
      `INSERT INTO project_milestones (project_id, title, description, order_index, status, cost, max_revisions, used_revisions, due_date)
       VALUES ($1, 'تطوير دليل الهوية البصرية', 'بناء دليل القواعد الإرشادية للألوان والخطوط والتطبيقات', 3, 'under_review', 1200.00, 3, 1, '2026-10-18')
       RETURNING id`,
      [noaaProjectId]
    );

    await db.query(
      `INSERT INTO project_milestones (project_id, title, description, order_index, status, cost, max_revisions, used_revisions)
       VALUES ($1, 'التسليم النهائي وحزمة الملفات المصدرية', 'تصدير الملفات المصدرية بجميع الصيغ مع التراخيص الكاملة', 4, 'pending', 800.00, 3, 0)`,
      [noaaProjectId]
    );

    // 7. مخرج المرحلة 3 (دليل الهوية للمعاينة في شاشة المراجعة)
    await db.query(
      `INSERT INTO milestone_deliverables (milestone_id, title, file_url, file_size, file_type, preview_image_url, version, status)
       VALUES ($1, 'دليل هوية نواة النسخة المبدئية', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', '18.2 MB', 'PDF', 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=1200&q=80', 1, 'under_review')`,
      [m3.rows[0].id]
    );

    // 8. ملفات التسليم النهائي للمشروع (شاشة التسليم النهائي)
    await db.query(
      `INSERT INTO final_deliverables (project_id, title, file_url, file_size, file_type)
       VALUES 
       ($1, 'الشعار بجميع المقاسات (AI, SVG, PNG)', 'https://example.com/logo-pack.zip', '12.4 MB', 'ZIP'),
       ($1, 'دليل الهوية الكامل (PDF)', 'https://example.com/brand-guidelines.pdf', '18.2 MB', 'PDF'),
       ($1, 'حزمة الخطوط والأيقونات', 'https://example.com/fonts-and-icons.zip', '5.8 MB', 'ZIP')`,
      [noaaProjectId]
    );

    // 9. ربط أعضاء الفريق بالمشروع
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role_in_project)
       VALUES 
       ($1, $2, 'قائدة التصميم'),
       ($1, $3, 'قائد المنتج'),
       ($4, $5, 'قائد التطوير'),
       ($4, $6, 'مطورة واجهات')
       ON CONFLICT DO NOTHING`,
      [
        noaaProjectId, teamUserIds['سارة القحطاني'], teamUserIds['خالد الحربي'],
        sallaProjectId, teamUserIds['أحمد السالم'], teamUserIds['نورة الدوسري']
      ]
    );

    // 10. سجل آخر النشاطات (مطابق تماماً لما في الصورة الأولى)
    await db.query('DELETE FROM activity_logs WHERE user_id = $1', [client.id]);
    await db.query(
      `INSERT INTO activity_logs (user_id, project_id, title, description, type)
       VALUES 
       ($1, $2, 'دليل هوية نواة جاهز للمراجعة', 'أرسلت سارة القحطاني النسخة النهائية منذ 30 دقيقة', 'deliverable'),
       ($1, $3, 'تقدم جديد في متجر سلة الخير', 'حدّث أحمد السالم نسبة الإنجاز إلى 65% منذ ساعتين', 'progress'),
       ($1, NULL, 'تمت إضافة رصيد إلى محفظتك', 'إيداع بقيمة 5,000 ر.س بنجاح أمس 04:30 م', 'wallet'),
       ($1, $4, 'بدء تصميم تجربة تطبيق موعد', 'بدأ خالد الحربي العمل على المرحلة الثانية أمس 10:00 ص', 'milestone')`,
      [client.id, noaaProjectId, sallaProjectId, mowedProjectId]
    );

    // 11. المواعيد القادمة في التقويم (مطابق لما في الصورة الأولى)
    await db.query('DELETE FROM project_events WHERE user_id = $1', [client.id]);
    await db.query(
      `INSERT INTO project_events (user_id, project_id, title, event_date, event_time, assigned_to)
       VALUES 
       ($1, $2, 'اعتماد دليل هوية نواة', '2026-10-18', '12:00 م', 'سارة القحطاني'),
       ($1, $3, 'تسليم واجهات سلة الخير', '2026-10-22', '03:00 م', 'أحمد السالم'),
       ($1, $4, 'مراجعة تجربة تطبيق موعد', '2026-10-25', '11:00 ص', 'خالد الحربي')`,
      [client.id, noaaProjectId, sallaProjectId, mowedProjectId]
    );

    // 12. بيانات جلسة الاستشارة الذكية وتوليد العقد المبدئي (مطابق للصورة 6)
    await db.query('DELETE FROM contracts WHERE client_id = $1', [client.id]);
    await db.query('DELETE FROM consultations WHERE client_id = $1', [client.id]);

    const consultationRes = await db.query(
      `INSERT INTO consultations (
         client_id, title, project_type, status, summary, estimated_duration, estimated_cost, consultation_date
       ) VALUES (
         $1, 'جلسة استشارة متجر رواق للأزياء', 'تطوير متجر إلكتروني', 'completed',
         'تحليل متطلبات إطلاق متجر إلكتروني متكامل للعلامة التجارية رواق يشمل الهوية وتجربة المستخدم وتطوير المتجر',
         '3 أسابيع', 14500.00, '2026-10-15 14:30:00'
       ) RETURNING id`,
      [client.id]
    );

    const consultationId = consultationRes.rows[0].id;

    const paymentTerms = [
      {
        milestone: 'المرحلة 1: تصميم الهوية ودليل العلامة',
        percentage: 30,
        amount: '4,350 ر.س',
        due: 'عند بدء المشروع',
        status: 'pending'
      },
      {
        milestone: 'المرحلة 2: تصميم تجربة وواجهات المتجر (UI/UX)',
        percentage: 40,
        amount: '5,800 ر.س',
        due: 'عند اعتماد الواجهات',
        status: 'pending'
      },
      {
        milestone: 'المرحلة 3: التطوير والربط مع بوابات الدفع والتسليم',
        percentage: 30,
        amount: '4,350 ر.س',
        due: 'عند التسليم النهائي والاعتماد',
        status: 'pending'
      }
    ];

    const deliverablesSummary = [
      {
        title: 'تصميم الهوية البصرية ودليل القواعد',
        cost: 4350.00,
        description: 'شعار، باليت الألوان، والخطوط الرسمية'
      },
      {
        title: 'تصميم واجهات المستخدم للمتجر',
        cost: 5800.00,
        description: 'تصميم تجربة التصفح والشراء في فيجما'
      },
      {
        title: 'برمجة المتجر وربط بوابات الدفع',
        cost: 4350.00,
        description: 'ربط سلة/زد مع بوابات مدى وأبل باي'
      }
    ];

    await db.query(
      `INSERT INTO contracts (
         consultation_id, client_id, contract_number, title, scope_of_work,
         total_amount, currency, duration_weeks, status, payment_terms, deliverables_summary,
         guarantee_terms
       ) VALUES (
         $1, $2, 'CNT-2026-0891', 'وثيقة نطاق العمل وعقد التنفيذ المبدئي - متجر رواق',
         'يهدف هذا العقد إلى تحديد الالتزامات ونطاق العمل الخاص بمشروع تصميم وتطوير متجر رواق الإلكتروني بما يشمل الهوية البصرية وتجربة المستخدم والتطوير الشامل وفق أعلى معايير الجودة والسرعة.',
         14500.00, 'ر.س', 3, 'draft', $3, $4,
         'تضمن المنصة حماية المدفوعات في حساب الضمان (Escrow) ولا يتم تحرير أي دفعة إلا بعد اعتماد العميل للمخرجات رسمياً.'
       )`,
      [consultationId, client.id, JSON.stringify(paymentTerms), JSON.stringify(deliverablesSummary)]
    );

    console.log('✅ Demo seed data matching UI designs seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seed();
