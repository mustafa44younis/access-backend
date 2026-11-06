const db = require('../../config/db');
const { createNotification } = require('../notifications/notifications.service');

/**
 * جلب ملخص المحفظة والبيانات المالية للعميل
 */
const getWalletAndSummary = async (userId) => {
  // جلب المحفظة أو إنشائها إن لم تكن موجودة
  let walletRes = await db.query(
    `SELECT id, available_balance, escrow_balance, total_spent, updated_at
     FROM wallets 
     WHERE user_id = $1`,
    [userId]
  );

  if (walletRes.rows.length === 0) {
    const newWalletRes = await db.query(
      `INSERT INTO wallets (user_id, available_balance, escrow_balance, total_spent)
       VALUES ($1, 10000.00, 0.00, 0.00)
       RETURNING id, available_balance, escrow_balance, total_spent, updated_at`,
      [userId]
    );
    walletRes = newWalletRes;
  }

  const wallet = walletRes.rows[0];

  // جلب إحصائيات العمليات
  const statsRes = await db.query(
    `SELECT 
       COUNT(*)::int AS total_transactions,
       COALESCE(SUM(amount) FILTER (WHERE type = 'escrow_deposit'), 0)::decimal AS total_escrowed,
       COALESCE(SUM(amount) FILTER (WHERE type = 'milestone_release'), 0)::decimal AS total_released
     FROM transactions
     WHERE user_id = $1 AND status = 'completed'`,
    [userId]
  );

  // جلب آخر 5 عمليات
  const recentTxRes = await db.query(
    `SELECT 
       t.id,
       t.transaction_number,
       t.type,
       t.amount,
       t.fee,
       t.currency,
       t.payment_method,
       t.status,
       t.description,
       t.invoice_number,
       t.receipt_url,
       t.created_at,
       p.title AS project_title
     FROM transactions t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT 5`,
    [userId]
  );

  return {
    wallet: {
      available_balance: parseFloat(wallet.available_balance),
      escrow_balance: parseFloat(wallet.escrow_balance),
      total_spent: parseFloat(wallet.total_spent),
      currency: 'ر.س',
      updated_at: wallet.updated_at,
    },
    stats: {
      total_transactions: statsRes.rows[0]?.total_transactions || 0,
      total_escrowed: parseFloat(statsRes.rows[0]?.total_escrowed || 0),
      total_released: parseFloat(statsRes.rows[0]?.total_released || 0),
    },
    supported_methods: [
      { id: 'mada', name: 'مدى (Mada)', icon: 'mada', is_default: true },
      { id: 'apple_pay', name: 'Apple Pay', icon: 'apple_pay', is_default: false },
      { id: 'visa_mastercard', name: 'بطاقة ائتمانية (Visa / Mastercard)', icon: 'card', is_default: false },
      { id: 'wallet_balance', name: 'رصيد المحفظة المتاح', icon: 'wallet', is_default: false },
      { id: 'bank_transfer', name: 'تحويل بنكي مباشر (سداد)', icon: 'bank', is_default: false },
    ],
    recent_transactions: recentTxRes.rows,
  };
};

/**
 * إيداع دفعة مرحلة البداية بحساب الضمان (Escrow Milestone Deposit)
 */
const depositEscrowForMilestone = async (userId, data = {}) => {
  const { projectId, milestoneId, paymentMethod = 'mada' } = data;

  if (!projectId) {
    const error = new Error('معرف المشروع مطلوب لإتمام عملية إيداع الضمان');
    error.statusCode = 400;
    throw error;
  }

  // 1. التحقق من وجود المشروع وصلاحية العميل
  const projectRes = await db.query(
    `SELECT p.*, u.full_name AS client_name 
     FROM projects p 
     JOIN users u ON u.id = p.client_id
     WHERE p.id = $1 AND p.client_id = $2`,
    [projectId, userId]
  );

  if (projectRes.rows.length === 0) {
    const error = new Error('المشروع غير موجود أو ليس لديك صلاحية للوصول إليه');
    error.statusCode = 404;
    throw error;
  }

  const project = projectRes.rows[0];

  // 2. تحديد المرحلة المطلوب دفعها
  let milestone;
  if (milestoneId) {
    const mRes = await db.query(
      `SELECT * FROM project_milestones WHERE id = $1 AND project_id = $2`,
      [milestoneId, projectId]
    );
    if (mRes.rows.length === 0) {
      const error = new Error('المرحلة المحددة غير موجودة في هذا المشروع');
      error.statusCode = 404;
      throw error;
    }
    milestone = mRes.rows[0];
  } else {
    // اختيار المرحلة الأولى افتراضياً
    const mRes = await db.query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC LIMIT 1`,
      [projectId]
    );
    milestone = mRes.rows[0];
  }

  const depositAmount = milestone ? parseFloat(milestone.cost || 0) : parseFloat(project.budget || 5000);
  if (depositAmount <= 0) {
    const error = new Error('قيمة الدفعة يجب أن تكون أكبر من صفر');
    error.statusCode = 400;
    throw error;
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 3. جلب محفظة العميل
    const walletRes = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    let wallet = walletRes.rows[0];
    if (!wallet) {
      const createW = await client.query(
        `INSERT INTO wallets (user_id, available_balance, escrow_balance, total_spent)
         VALUES ($1, 10000.00, 0.00, 0.00) RETURNING *`,
        [userId]
      );
      wallet = createW.rows[0];
    }

    const availableBal = parseFloat(wallet.available_balance);

    // إذا اختار الدفع من رصيد المحفظة، نتحقق من كفاية الرصيد
    if (paymentMethod === 'wallet_balance') {
      if (availableBal < depositAmount) {
        const error = new Error(`رصيد المحفظة المتاح (${availableBal} ر.س) غير كافٍ لإتمام الدفعة (${depositAmount} ر.س). يرجى شحن المحفظة أو اختيار وسيلة دفع أخرى.`);
        error.statusCode = 400;
        throw error;
      }

      await client.query(
        `UPDATE wallets 
         SET available_balance = available_balance - $1,
             escrow_balance = escrow_balance + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [depositAmount, userId]
      );
    } else {
      // دفع مباشر عبر مدى / أبل باي / بطاقة: يضاف مباشرة لرصيد الضمان المحجوز للمشروع
      await client.query(
        `UPDATE wallets 
         SET escrow_balance = escrow_balance + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [depositAmount, userId]
      );
    }

    // 4. تحديث حالة المرحلة إلى قيد التنفيذ
    if (milestone) {
      await client.query(
        `UPDATE project_milestones 
         SET status = 'in_progress', updated_at = NOW() 
         WHERE id = $1`,
        [milestone.id]
      );
    }

    // 5. تحديث حالة المشروع وتفعيل العد التنازلي
    await client.query(
      `UPDATE projects 
       SET status = 'in_progress', 
           current_phase_name = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [milestone ? milestone.title : 'المرحلة الأولى', projectId]
    );

    // 6. إنشاء سجل العملية المالية وإيصال الفاتورة
    const txNumber = `TXN-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const receiptUrl = `https://invoices.access.agency/receipts/${txNumber}.pdf`;

    const txRes = await client.query(
      `INSERT INTO transactions (
         user_id, project_id, milestone_id, transaction_number, type,
         amount, fee, currency, payment_method, status, description,
         invoice_number, receipt_url
       ) VALUES (
         $1, $2, $3, $4, 'escrow_deposit',
         $5, 0.00, 'ر.س', $6, 'completed', $7,
         $8, $9
       ) RETURNING *`,
      [
        userId,
        projectId,
        milestone ? milestone.id : null,
        txNumber,
        depositAmount,
        paymentMethod,
        `إيداع دفعة مرحلة البداية في حساب الضمان (Escrow) - ${milestone ? milestone.title : project.title}`,
        invoiceNumber,
        receiptUrl,
      ]
    );

    const transaction = txRes.rows[0];

    // 7. تسجيل الحدث في سجل الأنشطة (Activity Log)
    await client.query(
      `INSERT INTO activity_logs (user_id, project_id, title, description, type)
       VALUES ($1, $2, $3, $4, 'payment')`,
      [
        userId,
        projectId,
        'تم إيداع دفعة الضمان وبدء مرحلة التنفيذ',
        `تم إيداع مبلغ ${depositAmount} ر.س بحساب الضمان عبر ${paymentMethod} وبدأ فريق العمل التنفيذ رسمياً.`,
      ]
    );

    await client.query('COMMIT');

    // إرسال إشعار للعميل بنجاح الإيداع
    createNotification(userId, {
      title: 'تم إيداع دفعة الضمان بنجاح',
      body: `تم إيداع مبلغ ${depositAmount} ر.س بحساب الضمان لمشروع ${project.title} وبدء مرحلة التنفيذ`,
      type: 'payment',
      link: `/projects/${projectId}`
    });

    return {
      success: true,
      message: 'تم إيداع دفعة الضمان بنجاح وتفعيل بدء مرحلة العمل رسمياً',
      data: {
        transaction_id: transaction.id,
        transaction_number: transaction.transaction_number,
        invoice_number: transaction.invoice_number,
        project_id: projectId,
        milestone_id: milestone ? milestone.id : null,
        milestone_title: milestone ? milestone.title : null,
        amount: depositAmount,
        currency: 'ر.س',
        payment_method: paymentMethod,
        escrow_status: 'held_in_escrow',
        receipt_url: receiptUrl,
        protection_badge: 'محمي بالكامل بنظام حساب الضمان (Escrow Protection)',
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
 * شحن رصيد المحفظة المتاح
 */
const topUpWallet = async (userId, { amount, paymentMethod = 'mada' }) => {
  const topUpAmount = parseFloat(amount);
  if (!topUpAmount || topUpAmount <= 0) {
    const error = new Error('المبلغ المراد شحنه يجب أن يكون أكبر من صفر');
    error.statusCode = 400;
    throw error;
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // تحديث رصيد المحفظة
    const updateWallet = await client.query(
      `UPDATE wallets 
       SET available_balance = available_balance + $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [topUpAmount, userId]
    );

    const txNumber = `TOP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const txRes = await client.query(
      `INSERT INTO transactions (
         user_id, transaction_number, type, amount, fee, currency,
         payment_method, status, description, invoice_number
       ) VALUES (
         $1, $2, 'wallet_topup', $3, 0.00, 'ر.س',
         $4, 'completed', 'شحن رصيد المحفظة المتاح', $5
       ) RETURNING *`,
      [userId, txNumber, topUpAmount, paymentMethod, invoiceNumber]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم شحن رصيد المحفظة بنجاح',
      data: {
        transaction: txRes.rows[0],
        new_balance: parseFloat(updateWallet.rows[0].available_balance),
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
 * جلب كشف سجل العمليات المالية للعميل مع الفلاتر والصفحات
 */
const getTransactions = async (userId, { type, status, limit = 20, page = 1 } = {}) => {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const queryParams = [userId];
  let whereClauses = ['t.user_id = $1'];

  if (type && type !== 'all') {
    queryParams.push(type);
    whereClauses.push(`t.type = $${queryParams.length}`);
  }

  if (status && status !== 'all') {
    queryParams.push(status);
    whereClauses.push(`t.status = $${queryParams.length}`);
  }

  const whereSql = whereClauses.join(' AND ');

  const totalRes = await db.query(
    `SELECT COUNT(*)::int AS total FROM transactions t WHERE ${whereSql}`,
    queryParams
  );

  queryParams.push(parseInt(limit), offset);

  const txRes = await db.query(
    `SELECT 
       t.*,
       p.title AS project_title,
       pm.title AS milestone_title
     FROM transactions t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_milestones pm ON pm.id = t.milestone_id
     WHERE ${whereSql}
     ORDER BY t.created_at DESC
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );

  return {
    total: totalRes.rows[0]?.total || 0,
    page: parseInt(page),
    limit: parseInt(limit),
    transactions: txRes.rows,
  };
};

/**
 * جلب تفاصيل عملية مالية محددة مع الفاتورة
 */
const getTransactionById = async (userId, transactionId) => {
  const result = await db.query(
    `SELECT 
       t.*,
       p.title AS project_title,
       p.category AS project_category,
       pm.title AS milestone_title,
       u.full_name AS client_name,
       u.email AS client_email
     FROM transactions t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_milestones pm ON pm.id = t.milestone_id
     JOIN users u ON u.id = t.user_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [transactionId, userId]
  );

  if (result.rows.length === 0) {
    const error = new Error('العملية المالية غير موجودة أو ليس لديك صلاحية للوصول إليها');
    error.statusCode = 404;
    throw error;
  }

  const tx = result.rows[0];

  return {
    ...tx,
    invoice: {
      invoice_number: tx.invoice_number,
      issue_date: tx.created_at,
      payment_method: tx.payment_method,
      amount: tx.amount,
      fee: tx.fee,
      vat: 0.00,
      total: tx.amount,
      currency: tx.currency,
      status: tx.status,
      guarantee_terms: 'المبلغ محفوظ بنظام حساب الضمان المشفر ويحرر فقط بعد مراجعة واعتماد المرحلة من العميل.',
    },
  };
};

/**
 * جلب دفعات المراحل قيد الضمان (مطابق لجدول منتصف الشاشة 3)
 */
const getEscrowMilestones = async (userId) => {
  const query = `
    SELECT 
      pm.id AS milestone_id,
      pm.title AS milestone_title,
      pm.order_index,
      pm.cost AS held_amount,
      pm.status AS milestone_status,
      p.id AS project_id,
      p.title AS project_title,
      p.category AS project_category,
      COALESCE(
        (SELECT payment_method FROM transactions t WHERE t.milestone_id = pm.id AND t.type = 'escrow_deposit' ORDER BY t.created_at DESC LIMIT 1),
        'mada'
      ) AS payment_method,
      'held_in_escrow' AS escrow_status,
      'محمي بالضمان' AS escrow_status_ar,
      (SELECT COUNT(*)::int FROM financial_disputes d WHERE d.milestone_id = pm.id AND d.status = 'under_investigation') > 0 AS is_disputed
    FROM project_milestones pm
    JOIN projects p ON p.id = pm.project_id
    WHERE p.client_id = $1 AND pm.status IN ('in_progress', 'under_review')
    ORDER BY p.id ASC, pm.order_index ASC
  `;

  const result = await db.query(query, [userId]);
  return result.rows;
};

/**
 * معاينة تفاصيل حجز دفعة الضمان قبل التأكيد (نافذة يمين الشاشة 3)
 */
const previewEscrowDeposit = async (userId, { projectId, milestoneId }) => {
  const projectRes = await db.query(
    'SELECT id, title, budget FROM projects WHERE id = $1 AND client_id = $2',
    [projectId, userId]
  );

  if (projectRes.rows.length === 0) {
    const error = new Error('المشروع غير موجود');
    error.statusCode = 404;
    throw error;
  }

  const project = projectRes.rows[0];

  let milestone;
  if (milestoneId) {
    const mRes = await db.query(
      'SELECT id, title, cost, order_index FROM project_milestones WHERE id = $1 AND project_id = $2',
      [milestoneId, projectId]
    );
    milestone = mRes.rows[0];
  } else {
    const mRes = await db.query(
      'SELECT id, title, cost, order_index FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC LIMIT 1',
      [projectId]
    );
    milestone = mRes.rows[0];
  }

  const requiredAmount = milestone ? parseFloat(milestone.cost) : 4000.00;

  const walletRes = await db.query(
    'SELECT available_balance, escrow_balance FROM wallets WHERE user_id = $1',
    [userId]
  );

  const availableBalance = parseFloat(walletRes.rows[0]?.available_balance || 0);
  const remainingBalanceAfter = Math.max(0, availableBalance - requiredAmount);
  const canPayFromWallet = availableBalance >= requiredAmount;

  return {
    project: {
      id: project.id,
      title: project.title,
    },
    milestone: {
      id: milestone ? milestone.id : null,
      title: milestone ? milestone.title : 'المرحلة الأولى',
      order: milestone ? milestone.order_index : 1,
    },
    payment_breakdown: {
      required_amount: requiredAmount,
      currency: 'ر.س',
      current_available_balance: availableBalance,
      remaining_balance_after: remainingBalanceAfter,
      can_pay_from_wallet: canPayFromWallet,
      suggested_payment_methods: [
        { id: 'mada', name: 'بطاقة مدى (Mada)', is_recommended: true },
        { id: 'apple_pay', name: 'Apple Pay', is_recommended: false },
        { id: 'wallet_balance', name: 'رصيد المحفظة المتاح', is_disabled: !canPayFromWallet },
      ],
      protection_note: 'المبلغ محمي بنظام حساب الضمان المشفر (Escrow)، ولن يتم تحريره للمستقل إلا بعد معاينة واعتماد المرحلة من قبلك.',
    },
  };
};

/**
 * شحن المحفظة عبر البطاقة الائتمانية / مدى (نافذة وسط الشاشة 3 ومحاكاة رفض الدفع في الشاشة 5)
 */
const depositToWalletCard = async (userId, data = {}) => {
  const {
    amount,
    cardNumber,
    cardExpiry,
    cvv,
    cardholderName,
    paymentMethod = 'mada',
    simulateDecline = false,
  } = data;

  const topupAmount = parseFloat(amount);
  if (!topupAmount || topupAmount <= 0) {
    const error = new Error('المبلغ المراد إيداعه يجب أن يكون أكبر من صفر');
    error.statusCode = 400;
    throw error;
  }

  // محاكاة تعثر ورفض عملية الدفع (مطابق تماماً لنافذة الشاشة 5 يساراً)
  if (simulateDecline || (cardNumber && cardNumber.replace(/\s+/g, '').endsWith('0000'))) {
    const error = new Error('تعذر إتمام عملية الدفع: تم رفض العملية من قبل البنك المصدر للبطاقة بسبب قيود مصرفية أو عدم كفاية الرصيد.');
    error.statusCode = 402;
    error.code = 'ERR_PAYMENT_DECLINED_INSUFFICIENT_FUNDS';
    error.details = {
      amount: topupAmount,
      payment_method: paymentMethod,
      suggested_action: 'يرجى إعادة المحاولة ببطاقة أخرى أو استخدام التحويل البنكي المباشر.',
    };
    throw error;
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. زيادة رصيد المحفظة المتاح
    const walletRes = await client.query(
      `UPDATE wallets 
       SET available_balance = available_balance + $1, updated_at = NOW() 
       WHERE user_id = $2 
       RETURNING *`,
      [topupAmount, userId]
    );

    // 2. تسجيل العملية المالية
    const txNumber = `TXN-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const receiptUrl = `https://invoices.access.agency/receipts/${txNumber}.pdf`;

    const txRes = await client.query(
      `INSERT INTO transactions (
         user_id, transaction_number, type, amount, fee, currency,
         payment_method, status, description, invoice_number, receipt_url
       ) VALUES (
         $1, $2, 'wallet_topup', $3, 0.00, 'ر.س',
         $4, 'completed', 'شحن رصيد المحفظة المالية عبر البطاقة', $5, $6
       ) RETURNING *`,
      [userId, txNumber, topupAmount, paymentMethod, invoiceNumber, receiptUrl]
    );

    // 3. تسجيل النشاط
    await client.query(
      `INSERT INTO activity_logs (user_id, title, description, type)
       VALUES ($1, 'شحن رصيد المحفظة', $2, 'payment')`,
      [userId, `تم إيداع مبلغ ${topupAmount} ر.س في محفظتك المالية بنجاح وبدون أي رسوم إضافية.`]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم إيداع الرصيد في المحفظة المالية بنجاح',
      data: {
        transaction_id: txRes.rows[0].id,
        transaction_number: txNumber,
        invoice_number: invoiceNumber,
        deposited_amount: topupAmount,
        fee: 0.00,
        currency: 'ر.س',
        new_available_balance: parseFloat(walletRes.rows[0].available_balance),
        receipt_url: receiptUrl,
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
 * طلب استرداد الرصيد المتاح إلى الحساب البنكي (نافذة يسار الشاشة 4)
 */
const createWithdrawalRequest = async (userId, data = {}) => {
  const { amount, bankName, accountHolderName, iban } = data;

  const withdrawAmount = parseFloat(amount);
  if (!withdrawAmount || withdrawAmount <= 0) {
    const error = new Error('يرجى إدخال مبلغ صحيح للاسترداد');
    error.statusCode = 400;
    throw error;
  }

  if (!bankName || !accountHolderName || !iban) {
    const error = new Error('اسم البنك واسم صاحب الحساب ورقم الآيبان (IBAN) حقول مطلوبة');
    error.statusCode = 400;
    throw error;
  }

  // التحقق من صيغة الآيبان السعودي SA...
  const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
  if (!cleanIban.startsWith('SA') || cleanIban.length !== 24) {
    const error = new Error('رقم الآيبان البنكي الدولي غير صحيح، يجب أن يبدأ بـ SA ويتكون من 24 خانة');
    error.statusCode = 400;
    throw error;
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // التحقق من الرصيد المتاح
    const walletRes = await client.query(
      'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    const availableBal = parseFloat(walletRes.rows[0]?.available_balance || 0);
    if (availableBal < withdrawAmount) {
      const error = new Error(`رصيدك المتاح الحالي (${availableBal} ر.س) أقل من المبلغ المطلوب استرداده (${withdrawAmount} ر.س)`);
      error.statusCode = 400;
      throw error;
    }

    // خصم المبلغ من الرصيد المتاح
    await client.query(
      'UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW() WHERE user_id = $2',
      [withdrawAmount, userId]
    );

    // إنشاء طلب الاسترداد
    const reqNumber = `WDR-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const wdrRes = await client.query(
      `INSERT INTO withdrawal_requests (
         user_id, request_number, amount, bank_name, account_holder_name, iban, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')
       RETURNING *`,
      [userId, reqNumber, withdrawAmount, bankName, accountHolderName, cleanIban]
    );

    // تسجيل العملية المالية
    const txNumber = `TXN-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(
      `INSERT INTO transactions (
         user_id, transaction_number, type, amount, fee, currency,
         payment_method, status, description, invoice_number
       ) VALUES (
         $1, $2, 'refund', $3, 0.00, 'ر.س',
         'bank_transfer', 'completed', $4, $5
       )`,
      [
        userId,
        txNumber,
        withdrawAmount,
        `طلب استرداد رصيد متاح إلى الحساب البنكي (${bankName} - ${cleanIban.substring(0, 8)}****)`,
        reqNumber,
      ]
    );

    // تسجيل النشاط
    await client.query(
      `INSERT INTO activity_logs (user_id, title, description, type)
       VALUES ($1, 'طلب استرداد رصيد بنكي', $2, 'payment')`,
      [userId, `تم تقديم طلب استرداد مبلغ ${withdrawAmount} ر.س لحسابك في ${bankName}. جاري التحويل خلال 24-48 ساعة.`]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم استلام طلب الاسترداد بنجاح، وتتم المعالجة والتحويل خلال 24-48 ساعة عمل',
      data: wdrRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب سجل طلبات الاسترداد للعميل
 */
const getWithdrawalRequests = async (userId) => {
  const result = await db.query(
    'SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
};

/**
 * فتح تذكرة نزاع مالي وتدخل الإدارة لفض النزاع (نافذة وسط الشاشة 4)
 */
const createFinancialDispute = async (userId, data = {}) => {
  const { projectId, milestoneId, reason = 'delay', customReason, description, evidenceUrls = [] } = data;

  if (!projectId || !milestoneId) {
    const error = new Error('معرف المشروع ومعرف المرحلة مطلوبان لفتح النزاع المالي');
    error.statusCode = 400;
    throw error;
  }

  // التحقق من المرحلة والمشروع
  const milestoneRes = await db.query(
    `SELECT pm.*, p.title AS project_title 
     FROM project_milestones pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.id = $1 AND pm.project_id = $2 AND p.client_id = $3`,
    [milestoneId, projectId, userId]
  );

  if (milestoneRes.rows.length === 0) {
    const error = new Error('المرحلة المحددة غير موجودة أو ليس لديك صلاحية عليها');
    error.statusCode = 404;
    throw error;
  }

  const milestone = milestoneRes.rows[0];

  const reasonLabels = {
    delay: 'تأخر المنفذ عن موعد التسليم المتفق عليه',
    non_compliance: 'عدم مطابقة المخرجات للمواصفات والشروط الفنية',
    no_communication: 'انقطاع المنفذ أو تعذر التواصل معه',
    other: customReason || 'سبب آخر يستوجب تدخل الإدارة',
  };

  const reasonLabel = reasonLabels[reason] || reasonLabels.other;
  const disputeNumber = `DSP-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. تسجيل النزاع
    const disputeRes = await client.query(
      `INSERT INTO financial_disputes (
         project_id, milestone_id, client_id, dispute_number, disputed_amount,
         reason, reason_label, description, evidence_urls, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'under_investigation')
       RETURNING *`,
      [
        projectId,
        milestoneId,
        userId,
        disputeNumber,
        milestone.cost,
        reason,
        reasonLabel,
        description || null,
        JSON.stringify(evidenceUrls),
      ]
    );

    // 2. تجميد الدفعة في المرحلة
    await client.query(
      `UPDATE project_milestones SET status = 'under_review', updated_at = NOW() WHERE id = $1`,
      [milestoneId]
    );

    // 3. تسجيل النشاط
    await client.query(
      `INSERT INTO activity_logs (user_id, project_id, title, description, type)
       VALUES ($1, $2, 'فتح نزاع مالي وتدخل الإدارة', $3, 'system')`,
      [
        userId,
        projectId,
        `تم فتح تذكرة نزاع مالي برقم ${disputeNumber} بشأن مرحلة "${milestone.title}" وتجميد الدفعة في الضمان لحين البت فيها.`,
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم فتح تذكرة النزاع وتجميد الدفعة في الضمان، ويتدخل فريق الدعم والوساطة خلال 48 ساعة',
      data: disputeRes.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب قائمة النزاعات المالية للعميل
 */
const getFinancialDisputes = async (userId) => {
  const result = await db.query(
    `SELECT 
       d.*,
       p.title AS project_title,
       pm.title AS milestone_title
     FROM financial_disputes d
     JOIN projects p ON p.id = d.project_id
     JOIN project_milestones pm ON pm.id = d.milestone_id
     WHERE d.client_id = $1
     ORDER BY d.created_at DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * معاينة الفاتورة الضريبية المبسطة ZATCA المعتمدة (نافذة يمين الشاشة 4)
 */
const getTaxInvoiceDetails = async (userId, invoiceNumber) => {
  const txRes = await db.query(
    `SELECT 
       t.*,
       p.title AS project_title,
       p.category AS project_category,
       pm.title AS milestone_title,
       u.full_name AS client_name,
       u.email AS client_email,
       u.phone AS client_phone
     FROM transactions t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_milestones pm ON pm.id = t.milestone_id
     JOIN users u ON u.id = t.user_id
     WHERE (t.invoice_number = $1 OR t.transaction_number = $1) AND t.user_id = $2`,
    [invoiceNumber, userId]
  );

  if (txRes.rows.length === 0) {
    const error = new Error('الفاتورة الضريبية غير موجودة أو ليس لديك صلاحية لعرضها');
    error.statusCode = 404;
    throw error;
  }

  const tx = txRes.rows[0];
  const totalAmount = parseFloat(tx.amount);
  const vatRate = 0.15; // 15% ضريبة القيمة المضافة بالسعودية
  const subtotal = Number((totalAmount / (1 + vatRate)).toFixed(2));
  const vatAmount = Number((totalAmount - subtotal).toFixed(2));

  // تمثيل رمز التحقق ZATCA QR Code
  const qrString = `ZATCA|ACCESS Technology Platform|310459821300003|${tx.created_at}|${totalAmount}|${vatAmount}`;
  const qrBase64 = Buffer.from(qrString).toString('base64');

  return {
    invoice_header: {
      title: 'فاتورة ضريبية مبسطة (Simplified Tax Invoice)',
      invoice_number: tx.invoice_number,
      issue_date: tx.created_at,
      payment_date: tx.created_at,
      status: 'paid',
      status_ar: 'مدفوعة بالكامل',
    },
    seller: {
      name: 'مؤسسة ACCESS لحلول التقنية والبرمجيات',
      commercial_register: '1010892411',
      vat_number: '310459821300003',
      address: 'طريق الملك فهد، الرياض، المملكة العربية السعودية',
      email: 'billing@access.sa',
    },
    buyer: {
      name: tx.client_name,
      email: tx.client_email,
      phone: tx.client_phone || 'غير محدد',
    },
    line_items: [
      {
        description: tx.description || 'خدمات تطوير برمجيات واستشارات تقنية',
        quantity: 1,
        unit_price: subtotal,
        vat_rate: '15%',
        vat_amount: vatAmount,
        total: totalAmount,
      },
    ],
    financial_summary: {
      subtotal,
      vat_rate: '15%',
      vat_amount: vatAmount,
      grand_total: totalAmount,
      currency: 'ر.س',
      payment_method: tx.payment_method,
    },
    zatca_compliance: {
      is_compliant: true,
      qr_code_payload: qrBase64,
      qr_code_text: qrString,
    },
    download_url: `https://invoices.access.agency/pdf/${tx.invoice_number}.pdf`,
  };
};

/**
 * رفع إيصال التحويل البنكي للمراجعة المحاسبية (نافذة يمين الشاشة 5)
 */
const submitBankTransferReceipt = async (userId, data = {}) => {
  const { amount, bankName, accountHolderName, transferDate, receiptFileUrl, notes } = data;

  const transferAmount = parseFloat(amount);
  if (!transferAmount || transferAmount <= 0) {
    const error = new Error('يرجى تحديد مبلغ التحويل البنكي');
    error.statusCode = 400;
    throw error;
  }

  const refNumber = `BTR-2026-${Math.floor(100000 + Math.random() * 900000)}`;

  const result = await db.query(
    `INSERT INTO bank_transfer_receipts (
       user_id, reference_number, amount, bank_name, account_holder_name,
       transfer_date, receipt_file_url, status, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'under_review', $8)
     RETURNING *`,
    [
      userId,
      refNumber,
      transferAmount,
      bankName || 'مصرف الراجحي',
      accountHolderName || 'العميل',
      transferDate || new Date().toISOString().split('T')[0],
      receiptFileUrl || 'https://example.com/receipts/transfer-slip.pdf',
      notes || null,
    ]
  );

  return {
    success: true,
    message: 'تم استلام إيصال التحويل بنجاح وهو الآن قيد التدقيق المحاسبي',
    data: result.rows[0],
  };
};

/**
 * جلب حالة تدقيق إيصال التحويل البنكي (مطابق للشاشة 5 يميناً)
 */
const getBankTransferStatus = async (userId) => {
  const result = await db.query(
    `SELECT * FROM bank_transfer_receipts 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      has_pending_transfer: false,
    };
  }

  const receipt = result.rows[0];

  return {
    has_pending_transfer: receipt.status === 'under_review',
    receipt_data: {
      reference_number: receipt.reference_number,
      transferred_amount: parseFloat(receipt.amount),
      currency: 'ر.س',
      destination_bank: 'مصرف الراجحي - حساب مؤسسة ACCESS للتقنية',
      iban: 'SA4480000201608010009999',
      status: receipt.status,
      status_ar: receipt.status === 'under_review' ? 'إيصال التحويل قيد التدقيق المحاسبي' : 'تم اعتماد الإيداع',
      time_estimate: 'يتم تأكيد الإيداع في محفظتك خلال 30 دقيقة إلى ساعتين كحد أقصى.',
      uploaded_at: receipt.created_at,
    },
  };
};

module.exports = {
  getWalletAndSummary,
  depositEscrowForMilestone,
  topUpWallet,
  getTransactions,
  getTransactionById,
  getEscrowMilestones,
  previewEscrowDeposit,
  depositToWalletCard,
  createWithdrawalRequest,
  getWithdrawalRequests,
  createFinancialDispute,
  getFinancialDisputes,
  getTaxInvoiceDetails,
  submitBankTransferReceipt,
  getBankTransferStatus,
};

