const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting 2FA, Device Sessions, KYC & Profile Database Migration...');

    // 1. إضافة حقول الاسم الأول، اسم العائلة، والمصادقة الثنائية في جدول users
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB DEFAULT '[]'::jsonb;
    `);

    // تعبئة الاسم الأول والأخير تلقائياً من full_name للمستخدمين الحاليين
    await db.query(`
      UPDATE users 
      SET 
        first_name = SPLIT_PART(full_name, ' ', 1),
        last_name = SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
      WHERE first_name IS NULL AND full_name IS NOT NULL AND POSITION(' ' IN full_name) > 0;

      UPDATE users 
      SET first_name = full_name, last_name = '' 
      WHERE first_name IS NULL AND full_name IS NOT NULL;
    `);

    // 2. جدول جلسات تسجيل الدخول والأجهزة المتصلة النشطة
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(255) NOT NULL, -- مثل: جهاز Mac Studio - متصفح Safari
        device_type VARCHAR(50) DEFAULT 'desktop', -- desktop, mobile, tablet
        browser VARCHAR(100) DEFAULT 'Safari',
        os VARCHAR(100) DEFAULT 'macOS',
        ip_address VARCHAR(50) DEFAULT '192.168.1.1',
        location VARCHAR(255) DEFAULT 'الرياض، المملكة العربية السعودية',
        is_current BOOLEAN DEFAULT false,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. جدول التوثيق والاعتماد الرسمي (KYC / النفاذ الوطني / السجل التجاري)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        id_type VARCHAR(50) DEFAULT 'national_id', -- national_id, iqama
        id_number_masked VARCHAR(50) DEFAULT '108929****',
        commercial_register_name VARCHAR(255) DEFAULT 'مؤسسة أفق التقنية للتجارة',
        commercial_register_number VARCHAR(50) DEFAULT '1010******',
        freelance_doc_number VARCHAR(50) DEFAULT NULL,
        authority VARCHAR(255) DEFAULT 'النفاذ الوطني الموحد / وزارة التجارة',
        is_id_verified BOOLEAN DEFAULT true,
        is_commercial_verified BOOLEAN DEFAULT true,
        is_contact_verified BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'verified', -- verified, pending, unverified
        verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. الفهارس لتسريع الاستعلامات
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_verifications_user_id ON user_verifications(user_id);
    `);

    console.log('✅ 2FA, Device Sessions & KYC Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
