const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting disputes, withdrawals & tax invoices database migration...');

    // 1. جدول طلبات استرداد الرصيد المتاح إلى الحساب البنكي (مطابق للشاشة 4)
    await db.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        request_number VARCHAR(100) UNIQUE NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        bank_name VARCHAR(150) NOT NULL,
        account_holder_name VARCHAR(150) NOT NULL,
        iban VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'processing', -- pending, processing, completed, rejected
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);

    // 2. جدول تذاكر النزاعات المالية لتدخل إدارة المنصة (مطابق للشاشة 4)
    await db.query(`
      CREATE TABLE IF NOT EXISTS financial_disputes (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        milestone_id INTEGER REFERENCES project_milestones(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        dispute_number VARCHAR(100) UNIQUE NOT NULL,
        disputed_amount DECIMAL(12, 2) NOT NULL,
        reason VARCHAR(150) NOT NULL, -- delay, non_compliance, no_communication, other
        reason_label VARCHAR(255) NOT NULL,
        description TEXT,
        evidence_urls JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(50) DEFAULT 'under_investigation', -- under_investigation, resolved_refund, resolved_release, rejected
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      );
    `);

    // 3. جدول إيصالات التحويل البنكي قيد التدقيق المحاسبي (مطابق للشاشة 5)
    await db.query(`
      CREATE TABLE IF NOT EXISTS bank_transfer_receipts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reference_number VARCHAR(100) UNIQUE NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        bank_name VARCHAR(150) NOT NULL,
        account_holder_name VARCHAR(150) NOT NULL,
        transfer_date DATE NOT NULL,
        receipt_file_url TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'under_review', -- under_review, approved, rejected
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      );
    `);

    // 4. إنشاء الفهارس
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawal_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_disputes_client_id ON financial_disputes(client_id);
      CREATE INDEX IF NOT EXISTS idx_disputes_project_id ON financial_disputes(project_id);
      CREATE INDEX IF NOT EXISTS idx_bank_transfers_user_id ON bank_transfer_receipts(user_id);
    `);

    console.log('✅ Disputes, withdrawals & invoices migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
