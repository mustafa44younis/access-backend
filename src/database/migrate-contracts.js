const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting contracts & consultations database migration...');

    // 1. جدول جلسات الاستشارة الذكية (Consultations)
    await db.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        project_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'completed',
        summary TEXT,
        estimated_duration VARCHAR(100),
        estimated_cost DECIMAL(12, 2) DEFAULT 0.00,
        consultation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. جدول العقود المبدئية (Contracts)
    await db.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        contract_number VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        scope_of_work TEXT,
        total_amount DECIMAL(12, 2) DEFAULT 0.00,
        currency VARCHAR(20) DEFAULT 'ر.س',
        duration_weeks INTEGER DEFAULT 4,
        status VARCHAR(50) DEFAULT 'draft',
        payment_terms JSONB DEFAULT '[]'::jsonb,
        deliverables_summary JSONB DEFAULT '[]'::jsonb,
        guarantee_terms TEXT,
        signed_at TIMESTAMP,
        client_signature_name VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. إنشاء الفهارس
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_consultations_client_id ON consultations(client_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_consultation_id ON contracts(consultation_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
    `);

    console.log('✅ Contracts and consultations migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
