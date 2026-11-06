const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting smart consultations database migration...');

    // 1. توسيع جدول الاستشارات ليشمل بيانات الملخص الحي المتقدمة
    await db.query(`
      ALTER TABLE consultations 
      ADD COLUMN IF NOT EXISTS target_audience JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS suggested_technologies JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS min_budget DECIMAL(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS max_budget DECIMAL(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS min_duration_weeks INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS max_duration_weeks INTEGER DEFAULT 4,
      ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(50) DEFAULT 'ai';
    `);

    // 2. جدول رسائل المحادثة التفاعلية مع المساعد الذكي
    await db.query(`
      CREATE TABLE IF NOT EXISTS consultation_messages (
        id SERIAL PRIMARY KEY,
        consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
        sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'assistant')),
        message TEXT NOT NULL,
        suggestions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. فهارس لسرعة استرجاع الرسائل
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_messages_consultation_id 
      ON consultation_messages(consultation_id);
    `);

    console.log('✅ Smart consultations migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
