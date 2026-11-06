const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting payments & escrow database migration...');

    // 1. جدول المعاملات المالية والفواتير
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        milestone_id INTEGER REFERENCES project_milestones(id) ON DELETE SET NULL,
        transaction_number VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL, -- escrow_deposit, milestone_release, wallet_topup, refund, consultation_fee
        amount DECIMAL(12, 2) NOT NULL,
        fee DECIMAL(12, 2) DEFAULT 0.00,
        currency VARCHAR(20) DEFAULT 'ر.س',
        payment_method VARCHAR(50) DEFAULT 'mada', -- mada, apple_pay, visa_mastercard, wallet_balance, bank_transfer
        status VARCHAR(50) DEFAULT 'completed', -- completed, pending, failed, refunded
        description TEXT,
        invoice_number VARCHAR(100),
        receipt_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. فهارس لسرعة استرجاع العمليات
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
    `);

    // 3. التأكد من إنشاء محافظ لجميع المستخدمين المسجلين
    await db.query(`
      INSERT INTO wallets (user_id, available_balance, escrow_balance, total_spent)
      SELECT id, 10000.00, 0.00, 0.00 FROM users
      ON CONFLICT (user_id) DO NOTHING;
    `);

    console.log('✅ Payments & escrow migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Payments migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
