const db = require('../config/db');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    console.log('🌱 Seeding demo data matching UI designs...');

    // 1. جلب role_id لكل دور
    const rolesRes = await db.query('SELECT id, name FROM roles');
    const roleMap = {};
    rolesRes.rows.forEach(r => { roleMap[r.name] = r.id; });

    // 2. جلب أول عميل مسجل أو إنشاؤه تلقائياً إذا لم يكن موجوداً
    let clientRes = await db.query(
      `SELECT u.id, u.full_name, u.email 
       FROM users u 
       JOIN roles r ON r.id = u.role_id 
       WHERE r.name = 'client' 
       ORDER BY u.id ASC LIMIT 1`
    );

    let client;
    if (clientRes.rows.length === 0) {
      console.log('ℹ️ No client found. Creating default client user (younismustafa932@gmail.com)...');
      const clientPassword = await bcrypt.hash('Password123', 10);
      const insertClient = await db.query(
        `INSERT INTO users (
           full_name, first_name, last_name, email, password, role_id, is_active, is_email_verified
         ) VALUES ($1, $2, $3, $4, $5, $6, true, true)
         RETURNING id, full_name, email`,
        [
          'مصطفى يونس',
          'مصطفى',
          'يونس',
          'younismustafa932@gmail.com',
          clientPassword,
          roleMap['client'],
        ]
      );
      client = insertClient.rows[0];
      console.log(`✅ Default client created: ${client.full_name} (${client.email})`);
    } else {
      client = clientRes.rows[0];
      console.log(`👤 Using existing client: ${client.full_name} (ID: ${client.id})`);
    }

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

    // 12. بيانات جلسة الاستشارة الذكية والمحادثة والملخص الحي وتوليد العقد المبدئي (مطابق لشاشات فيغما 1 و 2 و 3)
    await db.query('DELETE FROM contracts WHERE client_id = $1', [client.id]);
    await db.query('DELETE FROM consultations WHERE client_id = $1', [client.id]);

    const targetAudience = [
      'المتسوقون في السعودية المهتمون بالمنتجات الحرفية المحلية',
      'محبو الصناعات اليدوية'
    ];

    const features = [
      'كتالوج منتجات مع البحث والتصفية',
      'الدفع عبر مدى و Apple Pay',
      'تتبع الطلبات',
      'لوحة إدارة المنتجات والطلبات'
    ];

    const suggestedTechnologies = ['Shopify', 'Next.js'];

    const consultationRes = await db.query(
      `INSERT INTO consultations (
         client_id, title, project_type, status, summary, estimated_duration, estimated_cost,
         target_audience, features, suggested_technologies, min_budget, max_budget,
         min_duration_weeks, max_duration_weeks, consultation_type, consultation_date
       ) VALUES (
         $1, 'متجر رواق', 'متجر إلكتروني للمنتجات الحرفية المحلية', 'completed',
         'متجر إلكتروني للمنتجات الحرفية المحلية يستهدف المتسوقين في السعودية مع لوحة إدارة وبوابات دفع وتتبع للطلبات',
         '4-5 أسابيع', 14500.00,
         $2, $3, $4, 12000.00, 18000.00,
         4, 5, 'ai', '2026-10-18 10:00:00'
       ) RETURNING id`,
      [
        client.id,
        JSON.stringify(targetAudience),
        JSON.stringify(features),
        JSON.stringify(suggestedTechnologies)
      ]
    );

    const consultationId = consultationRes.rows[0].id;

    // محادثة المساعد الذكي مع العميل (مطابق تماماً للشاشة 1)
    await db.query(
      `INSERT INTO consultation_messages (consultation_id, sender, message, suggestions, created_at)
       VALUES 
       ($1, 'assistant', 'أهلاً بك! أنا مساعدك الذكي في ACCESS، سأساعدك على تحويل فكرتك إلى ملخص مشروع واضح. ما نوع المشروع الذي تفكر فيه؟', $2, NOW() - INTERVAL '15 minutes'),
       ($1, 'user', 'أريد متجراً إلكترونياً باسم متجر رواق للمنتجات الحرفية المحلية. يستهدف المتسوقين في السعودية، أحتاج كتالوجاً مع البحث والتصفية، والدفع بمدى و Apple Pay وتتبع الطلبات، ولوحة إدارة المنتجات والطلبات.', '[]'::jsonb, NOW() - INTERVAL '10 minutes'),
       ($1, 'assistant', 'فكرة واضحة! أضفت احتياجاتك إلى الملخص. أقترح مبدئياً متجر Shopify مع Next.js... التقدير الأولي: 12-18 ألف ر.س خلال 4-5 أسابيع، وإيداع بعد تأكيد النطاق. راجع الملخص وأخبرني بأي إضافة قبل اعتماده.', '[]'::jsonb, NOW() - INTERVAL '5 minutes')`,
      [
        consultationId,
        JSON.stringify(['تطبيق جوال', 'متجر إلكتروني', 'هوية بصرية'])
      ]
    );

    // بنود مراحل التنفيذ والتكلفة (مطابق للشاشة 3)
    const paymentTerms = [
      {
        order: '01',
        milestone: 'تصميم واجهات وتجربة المستخدم (UI/UX)',
        duration: '1.5 أسبوع',
        duration_weeks: 1.5,
        percentage: 28,
        amount: '4,000 ر.س',
        cost: 4000.00,
        due: 'عند بدء المشروع',
        status: 'pending'
      },
      {
        order: '02',
        milestone: 'تطوير المتجر وربط بوابات الدفع',
        duration: '2.5 أسبوع',
        duration_weeks: 2.5,
        percentage: 55,
        amount: '8,000 ر.س',
        cost: 8000.00,
        due: 'عند اعتماد الواجهات',
        status: 'pending'
      },
      {
        order: '03',
        milestone: 'الفحص والاختبار والنشر النهائي',
        duration: '1 أسبوع',
        duration_weeks: 1.0,
        percentage: 17,
        amount: '2,500 ر.س',
        cost: 2500.00,
        due: 'عند التسليم النهائي والاعتماد',
        status: 'pending'
      }
    ];

    const deliverablesSummary = [
      {
        order: '01',
        title: 'تصميم واجهات وتجربة المستخدم (UI/UX)',
        duration: '1.5 أسبوع',
        cost: 4000.00,
        description: 'تصميم تجربة التصفح والشراء في فيجما والتحقق من تجربة المستخدم'
      },
      {
        order: '02',
        title: 'تطوير المتجر وربط بوابات الدفع',
        duration: '2.5 أسبوع',
        cost: 8000.00,
        description: 'برمجة المتجر وربط بوابات الدفع مدى و Apple Pay وبناء لوحة الإدارة'
      },
      {
        order: '03',
        title: 'الفحص والاختبار والنشر النهائي',
        duration: '1 أسبوع',
        cost: 2500.00,
        description: 'اختبار تجربة الشراء الشاملة، إصلاح الثغرات، وتهيئة المتجر للإطلاق'
      }
    ];

    await db.query(
      `INSERT INTO contracts (
         consultation_id, client_id, contract_number, title, scope_of_work,
         total_amount, currency, duration_weeks, status, payment_terms, deliverables_summary,
         guarantee_terms
       ) VALUES (
         $1, $2, 'CNT-2026-0891', 'وثيقة نطاق العمل وعقد التنفيذ المبدئي - متجر رواق',
         'اعتماد متجر إلكتروني للمنتجات الحرفية كقوالب وأتمتة وبوابات دفع آمنة وفق أعلى معايير الجودة والسرعة.',
         14500.00, 'ر.س', 5, 'draft', $3, $4,
         'تضمن المنصة حماية المدفوعات في حساب الضمان (Escrow) وتقسيم العمل على مرحلتين مع اعتماد تلقائي بعد مرور 72 ساعة.'
       )`,
      [consultationId, client.id, JSON.stringify(paymentTerms), JSON.stringify(deliverablesSummary)]
    );

    // 13. ملفات الخبراء والمواعيد المتاحة للاستشارات البشرية (مطابق للشاشة 2 يساراً)
    await db.query('DELETE FROM expert_bookings');
    await db.query('DELETE FROM expert_availability_slots');
    await db.query('DELETE FROM expert_profiles');

    // خبير 1: أحمد السالم
    const ahmedProfileRes = await db.query(
      `INSERT INTO expert_profiles (
         user_id, title, bio, rating, reviews_count, badge, consultation_fee, currency, is_available
       ) VALUES (
         $1, 'كبير مهندسي الحلول وقائد فرق المتاجر والمنصات',
         'خبير متخصص في هندسة وبناء منصات التجارة الإلكترونية وحلول الدفع السحابية مع خبرة تزيد عن 8 سنوات.',
         4.9, 28, 'خبير معتمد', 250.00, 'ر.س', true
       ) RETURNING id`,
      [teamUserIds['أحمد السالم']]
    );
    const ahmedProfileId = ahmedProfileRes.rows[0].id;

    // خبيرة 2: سارة القحطاني
    const saraProfileRes = await db.query(
      `INSERT INTO expert_profiles (
         user_id, title, bio, rating, reviews_count, badge, consultation_fee, currency, is_available
       ) VALUES (
         $1, 'مستشارة تجربة المستخدم وصياغة المنتجات الرقمية',
         'مستشارة متخصصة في أبحاث وتصميم واجهات وتجربة المستخدم وتطوير المنتجات الرقمية وفق أفضل المعايير.',
         4.9, 22, 'خبيرة معتمدة', 250.00, 'ر.س', true
       ) RETURNING id`,
      [teamUserIds['سارة القحطاني']]
    );
    const saraProfileId = saraProfileRes.rows[0].id;

    // المواعيد المتاحة القادمة (أيام: 18، 19، 20 أكتوبر 2026)
    const slotDates = ['2026-10-18', '2026-10-19', '2026-10-20'];
    const slotTimes = ['10:00 ص', '11:00 ص', '01:00 م', '03:00 م'];

    for (const expertId of [ahmedProfileId, saraProfileId]) {
      for (const d of slotDates) {
        for (const t of slotTimes) {
          await db.query(
            `INSERT INTO expert_availability_slots (expert_id, slot_date, slot_time, is_booked)
             VALUES ($1, $2, $3, false)
             ON CONFLICT DO NOTHING`,
            [expertId, d, t]
          );
        }
      }
    }

    // 14. بذور المعاملات المالية والمحفظة (Payments & Escrow Transactions)
    await db.query('DELETE FROM transactions');
    await db.query(
      `INSERT INTO transactions (
         user_id, project_id, transaction_number, type, amount, fee, currency,
         payment_method, status, description, invoice_number, receipt_url, created_at
       ) VALUES 
       ($1, $2, 'TXN-2026-891001', 'escrow_deposit', 4000.00, 0.00, 'ر.س', 'mada', 'completed', 'إيداع دفعة مرحلة البداية في حساب الضمان (Escrow) - متجر رواق', 'INV-2026-8901', 'https://invoices.access.agency/receipts/TXN-2026-891001.pdf', NOW() - INTERVAL '3 days'),
       ($1, $2, 'TXN-2026-891002', 'consultation_fee', 250.00, 0.00, 'ر.س', 'apple_pay', 'completed', 'رسوم استشارة تقنية مع خبير - م. أحمد السالم', 'INV-2026-8902', 'https://invoices.access.agency/receipts/TXN-2026-891002.pdf', NOW() - INTERVAL '5 days'),
       ($1, NULL, 'TXN-2026-891003', 'wallet_topup', 15000.00, 0.00, 'ر.س', 'visa_mastercard', 'completed', 'شحن رصيد المحفظة المتاح عبر البطاقة الائتمانية', 'INV-2026-8903', 'https://invoices.access.agency/receipts/TXN-2026-891003.pdf', NOW() - INTERVAL '10 days')`,
      [client.id, sallaProjectId]
    );

    // 15. بذور المحادثات والرسائل (Messages & Conversations)
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM conversation_participants');
    await db.query('DELETE FROM conversations');

    // محادثة 1: قناة مشروع هوية نواة
    const conv1Res = await db.query(
      `INSERT INTO conversations (project_id, title, type, last_message_text, last_message_at)
       VALUES ($1, 'قناة مشروع: هوية نواة', 'project_channel', 'تم رفع مسودة دليل الهوية للمراجعة في المرحلة 3', NOW() - INTERVAL '2 hours')
       RETURNING id`,
      [noaaProjectId]
    );
    const conv1Id = conv1Res.rows[0].id;

    // محادثة 2: قناة مشروع متجر سلة الخير
    const conv2Res = await db.query(
      `INSERT INTO conversations (project_id, title, type, last_message_text, last_message_at)
       VALUES ($1, 'قناة مشروع: متجر سلة الخير', 'project_channel', 'أهلاً بك يا مصطفى، تم تأكيد إيداع الضمان وجاري العمل على الواجهات', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [sallaProjectId]
    );
    const conv2Id = conv2Res.rows[0].id;

    // إضافة المشاركين
    // محادثة 1: العميل + أحمد السالم + سارة القحطاني
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
       VALUES 
       ($1, $2, NOW() - INTERVAL '3 hours'),
       ($1, $3, NOW()),
       ($1, $4, NOW())`,
      [conv1Id, client.id, teamUserIds['أحمد السالم'], teamUserIds['سارة القحطاني']]
    );

    // محادثة 2: العميل + أحمد السالم
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
       VALUES 
       ($1, $2, NOW()),
       ($1, $3, NOW())`,
      [conv2Id, client.id, teamUserIds['أحمد السالم']]
    );

    // رسائل محادثة 1
    await db.query(
      `INSERT INTO messages (conversation_id, sender_id, message_text, attachment_url, attachment_name, attachment_type, attachment_size, is_read, created_at)
       VALUES 
       ($1, $2, 'السلام عليكم، مرحباً بفريق العمل! نود التركيز على الألوان الترابية والعصرية للهوية.', NULL, NULL, NULL, NULL, true, NOW() - INTERVAL '1 day'),
       ($1, $3, 'وعليكم السلام يا مصطفى! أهلاً بك. تم استيعاب التوجه وجاري تطبيق باليت الألوان على النماذج الأولية.', NULL, NULL, NULL, NULL, true, NOW() - INTERVAL '18 hours'),
       ($1, $4, 'تم الانتهاء من مسودة دليل الهوية البصرية وإرفاق الملف للاطلاع والمراجعة.', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'دليل هوية نواة النسخة المبدئية.pdf', 'PDF', '18.2 MB', false, NOW() - INTERVAL '2 hours')`,
      [conv1Id, client.id, teamUserIds['أحمد السالم'], teamUserIds['سارة القحطاني']]
    );

    // رسائل محادثة 2 (مطابقة لصور المحادثة والرسائل الصوتية والرسالة المتعثرة)
    const waveform = [15, 30, 65, 80, 45, 90, 75, 40, 20, 60, 85, 50, 70, 95, 60, 35, 20, 45, 80, 65];
    await db.query(
      `INSERT INTO messages (
         conversation_id, sender_id, message_text, attachment_url, attachment_name,
         attachment_type, attachment_size, message_type, audio_duration, audio_waveform,
         is_failed, is_read, created_at
       ) VALUES 
       ($1, $2, 'أهلاً بك يا مصطفى، تم تأكيد إيداع الضمان وجاري العمل على الواجهات والربط التقني.', NULL, NULL, NULL, NULL, 'text', NULL, '[]'::jsonb, false, true, NOW() - INTERVAL '1 day'),
       ($1, $3, 'أولاً أود أن أوضح أن إتمام العمل يتم وفق جدول زمني دقيق يبدأ من اليوم حتى انتهاء مرحلة التصميم.', NULL, NULL, NULL, NULL, 'text', NULL, '[]'::jsonb, false, true, NOW() - INTERVAL '5 hours'),
       ($1, $2, 'تسجيل صوتي لملاحظات واجهة المتجر وتعديل الألوان', 'https://assets.access.agency/audio/salla-voice-feedback.mp3', 'ملاحظات_صوتية.mp3', 'MP3', '1.2 MB', 'voice_note', 34, $4::jsonb, false, true, NOW() - INTERVAL '3 hours'),
       ($1, $3, 'وصلت النقطة بدقة وسأبدأ بمراجعة التعديلات وسنبدأ التنفيذ مباشرة حسب الملاحظات.', NULL, NULL, NULL, NULL, 'text', NULL, '[]'::jsonb, false, true, NOW() - INTERVAL '1 hour'),
       ($1, $3, 'قمت بمراجعة التعديلات وسأرفق العقد مجدداً بدقة', NULL, NULL, NULL, NULL, 'text', NULL, '[]'::jsonb, true, false, NOW() - INTERVAL '5 minutes')`,
      [
        conv2Id,
        teamUserIds['أحمد السالم'],
        client.id,
        JSON.stringify(waveform),
      ]
    );

    // 16. بذور مستودع الملفات والمستندات المشتركة للمشروع (مطابق تماماً للشاشة 3 يساراً)
    await db.query('DELETE FROM project_shared_files');
    await db.query(
      `INSERT INTO project_shared_files (
         project_id, uploaded_by, file_name, file_url, file_type, file_category,
         file_size, preview_image_url, audio_duration, created_at
       ) VALUES 
       ($1, $2, 'عقد تطوير متجر سلة الخير.pdf', 'https://assets.access.agency/docs/contract-salla.pdf', 'PDF', 'documents', '2.4 MB', NULL, NULL, NOW() - INTERVAL '4 days'),
       ($1, $3, 'معاينة واجهة المتجر الرئيسية.png', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', 'PNG', 'designs', '1.8 MB', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80', NULL, NOW() - INTERVAL '2 days'),
       ($1, $2, 'التسجيل الصوتي لملاحظات العميل.mp3', 'https://assets.access.agency/audio/client-notes.mp3', 'MP3', 'audio', '4.2 MB', NULL, '03:45', NOW() - INTERVAL '1 day'),
       ($1, $3, 'واجهات متجر سلة الخير - Figma', 'https://figma.com/file/demo-salla-store-access', 'FIGMA', 'designs', 'رابط سحابي', 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80', NULL, NOW() - INTERVAL '12 hours')`,
      [sallaProjectId, client.id, teamUserIds['أحمد السالم']]
    );

    // 17. بذور طلب تدخل إدارة المنصة لفض نزاع في المحادثة (مطابق للشاشة 4 يميناً)
    await db.query('DELETE FROM chat_interventions');
    await db.query(
      `INSERT INTO chat_interventions (
         conversation_id, project_id, requested_by, reason, reason_label,
         details, include_transcript, status, created_at
       ) VALUES 
       ($1, $2, $3, 'dispute_specifications', 'خلاف حول مواصفات العقد', 'يرجى مراجعة نطاق العمل المتفق عليه بخصوص بوابات الدفع الإلكترونية وسرعة الاستجابة', true, 'pending_admin', NOW() - INTERVAL '2 hours')`,
      [conv2Id, sallaProjectId, client.id]
    );

    // 18. تحديث المصادقة الثنائية (2FA) والاسم الأول والأخير للعميل
    const backupCodes = [
      'A1B2-C3D4', 'E5F6-G7H8', 'I9J0-K1L2', 'M3N4-O5P6',
      'Q7R8-S9T0', 'U1V2-W3X4', 'Y5Z6-A7B8', 'C9D0-E1F2'
    ];
    await db.query(
      `UPDATE users 
       SET 
         first_name = 'مصطفى',
         last_name = 'يونس',
         two_factor_enabled = true,
         two_factor_secret = 'JBSWY3DPEHPK3PXP',
         two_factor_backup_codes = $1::jsonb
       WHERE id = $2`,
      [JSON.stringify(backupCodes), client.id]
    );

    // 19. بذور الجلسات النشطة والأجهزة المتصلة (مطابق تماماً للشاشة 3 و 4)
    await db.query('DELETE FROM user_sessions WHERE user_id = $1', [client.id]);
    await db.query(
      `INSERT INTO user_sessions (
         user_id, device_name, device_type, browser, os, ip_address, location, is_current, last_active_at
       ) VALUES 
       ($1, 'جهاز Mac Studio - متصفح Safari', 'desktop', 'Safari 17.2', 'macOS Sonoma', '192.168.1.101', 'الرياض، المملكة العربية السعودية', true, NOW()),
       ($1, 'هاتف جوال iPhone 15 Pro - تطبيق ACCESS', 'mobile', 'ACCESS iOS App', 'iOS 17.4', '178.52.21.90', 'جدة، المملكة العربية السعودية', false, NOW() - INTERVAL '4 hours'),
       ($1, 'جهاز كمبيوتر Windows 11 - متصفح Chrome', 'desktop', 'Chrome 122.0', 'Windows 11 Pro', '212.118.14.33', 'الرياض، المملكة العربية السعودية', false, NOW() - INTERVAL '2 days')`,
      [client.id]
    );

    // 20. بذور التوثيق والاعتماد الرسمي (مطابق لنافذة التوثيق الرسمية في الشاشة 3)
    await db.query('DELETE FROM user_verifications WHERE user_id = $1', [client.id]);
    await db.query(
      `INSERT INTO user_verifications (
         user_id, id_type, id_number_masked, commercial_register_name,
         commercial_register_number, freelance_doc_number, authority,
         is_id_verified, is_commercial_verified, is_contact_verified,
         status, verified_at
       ) VALUES (
         $1, 'national_id', '108929****', 'مؤسسة أفق التقنية للتجارة',
         '1010******', 'FL-89210-99', 'النفاذ الوطني الموحد / وزارة التجارة',
         true, true, true, 'verified', NOW() - INTERVAL '30 days'
       )`,
      [client.id]
    );

    console.log('✅ Demo seed data matching UI designs seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seed();
