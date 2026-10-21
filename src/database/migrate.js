const db = require('../config/db');

const migrate = async () => {
  try {
    // جدول الأدوار
    await db.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        name_ar VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // جدول المستخدمين
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        role_id INTEGER REFERENCES roles(id) ON DELETE RESTRICT,
        is_active BOOLEAN DEFAULT true,
        is_email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // إدخال الأدوار الأساسية
    await db.query(`
      INSERT INTO roles (name, name_ar, description) VALUES
        ('client', 'صاحب عمل / عميل', 'صاحب الفكرة الذي يطلب تنفيذ المشاريع'),
        ('team_leader', 'قائد فريق', 'المسؤول عن إدارة المشروع وتوزيع المهام'),
        ('specialist', 'مستقل محترف', 'عضو الفريق الذي ينفذ المهام'),
        ('admin', 'إدارة المنصة', 'مشرف النظام')
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('✅ Tables created and roles seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();