const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting projects & dashboard database migration...');

    // 1. تحديث جدول المستخدمين لإضافة الصورة والمسمى الوظيفي
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(150);
    `);

    // 2. جدول المحافظ المالية
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        available_balance DECIMAL(12, 2) DEFAULT 0.00,
        escrow_balance DECIMAL(12, 2) DEFAULT 0.00,
        total_spent DECIMAL(12, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. جدول المشاريع
    await db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        team_leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(200) NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'in_progress',
        current_phase_name VARCHAR(150),
        budget DECIMAL(12, 2) DEFAULT 0.00,
        progress INTEGER DEFAULT 0,
        deadline DATE,
        auto_approval_deadline TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. جدول محطات وخريطة إنجاز المشروع (Milestones)
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_milestones (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        order_index INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'pending',
        cost DECIMAL(12, 2) DEFAULT 0.00,
        due_date DATE,
        max_revisions INTEGER DEFAULT 3,
        used_revisions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. جدول مخرجات ومراجعات كل مرحلة
    await db.query(`
      CREATE TABLE IF NOT EXISTS milestone_deliverables (
        id SERIAL PRIMARY KEY,
        milestone_id INTEGER REFERENCES project_milestones(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_size VARCHAR(50),
        file_type VARCHAR(50),
        preview_image_url TEXT,
        version INTEGER DEFAULT 1,
        client_notes TEXT,
        status VARCHAR(50) DEFAULT 'under_review',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. جدول ملفات التسليم النهائي وحزم التنزيل
    await db.query(`
      CREATE TABLE IF NOT EXISTS final_deliverables (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_size VARCHAR(50),
        file_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. جدول أعضاء فريق المشروع
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role_in_project VARCHAR(100),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (project_id, user_id)
      );
    `);

    // 8. جدول سجل النشاطات (Activity Log)
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. جدول المواعيد القادمة في التقويم
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        event_date DATE NOT NULL,
        event_time VARCHAR(50),
        assigned_to VARCHAR(150),
        status VARCHAR(50) DEFAULT 'upcoming',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // إنشاء الفهارس (Indexes) لسرعة الاستعلامات
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON project_milestones(project_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_project_events_user_date ON project_events(user_id, event_date);
    `);

    console.log('✅ All project tables and indexes created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
