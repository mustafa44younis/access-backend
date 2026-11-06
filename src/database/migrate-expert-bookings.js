const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting expert consultation bookings database migration...');

    // 1. جدول ملفات الخبراء والمستشارين التقنيين
    await db.query(`
      CREATE TABLE IF NOT EXISTS expert_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        title VARCHAR(200) NOT NULL,
        bio TEXT,
        rating DECIMAL(3, 2) DEFAULT 4.9,
        reviews_count INTEGER DEFAULT 24,
        badge VARCHAR(100) DEFAULT 'خبير معتمد',
        consultation_fee DECIMAL(10, 2) DEFAULT 250.00,
        currency VARCHAR(20) DEFAULT 'ر.س',
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. جدول المواعيد المتاحة للخبراء (Slots)
    await db.query(`
      CREATE TABLE IF NOT EXISTS expert_availability_slots (
        id SERIAL PRIMARY KEY,
        expert_id INTEGER REFERENCES expert_profiles(id) ON DELETE CASCADE,
        slot_date DATE NOT NULL,
        slot_time VARCHAR(50) NOT NULL,
        is_booked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (expert_id, slot_date, slot_time)
      );
    `);

    // 3. جدول حجوزات الاستشارات مع الخبراء
    await db.query(`
      CREATE TABLE IF NOT EXISTS expert_bookings (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        expert_id INTEGER REFERENCES expert_profiles(id) ON DELETE CASCADE,
        consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
        session_type VARCHAR(50) NOT NULL DEFAULT 'video_call',
        duration_minutes INTEGER DEFAULT 30,
        booking_date DATE NOT NULL,
        booking_time VARCHAR(50) NOT NULL,
        fee DECIMAL(10, 2) DEFAULT 250.00,
        status VARCHAR(50) DEFAULT 'confirmed',
        meeting_link TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. إنشاء الفهارس
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_expert_slots_expert_date ON expert_availability_slots(expert_id, slot_date);
      CREATE INDEX IF NOT EXISTS idx_expert_bookings_client ON expert_bookings(client_id);
      CREATE INDEX IF NOT EXISTS idx_expert_bookings_expert ON expert_bookings(expert_id);
    `);

    console.log('✅ Expert bookings migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
