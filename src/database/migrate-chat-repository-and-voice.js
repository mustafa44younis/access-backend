const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting chat repository, voice notes & intervention database migration...');

    // 1. توسيع جدول الرسائل لدعم الرسائل الصوتية، أنواع الرسائل، وحالات التعثر
    await db.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text', -- text, file, image, voice_note
      ADD COLUMN IF NOT EXISTS audio_duration INTEGER DEFAULT NULL, -- مدة الصوت بالثواني
      ADD COLUMN IF NOT EXISTS audio_waveform JSONB DEFAULT '[]'::jsonb, -- مصفوفة أعمدة الموجة الصوتية
      ADD COLUMN IF NOT EXISTS is_failed BOOLEAN DEFAULT false;
    `);

    // 2. جدول مستودع الملفات والمستندات المشتركة للمشروع (مطابق للشاشة 3 يساراً)
    await db.query(`
      CREATE TABLE IF NOT EXISTS project_shared_files (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL, -- PDF, PNG, JPG, MP3, FIGMA, ZIP
        file_category VARCHAR(50) NOT NULL, -- designs, documents, audio, other
        file_size VARCHAR(50),
        preview_image_url TEXT,
        audio_duration VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. جدول طلبات تدخل إدارة المنصة لفض النزاع في المحادثة (مطابق للشاشة 4 يميناً)
    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_interventions (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        requested_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(100) NOT NULL,
        reason_label VARCHAR(255) NOT NULL,
        details TEXT NOT NULL,
        include_transcript BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'pending_admin', -- pending_admin, admin_joined, resolved, closed
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      );
    `);

    // 4. إنشاء الفهارس
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_files_project_id ON project_shared_files(project_id);
      CREATE INDEX IF NOT EXISTS idx_shared_files_category ON project_shared_files(file_category);
      CREATE INDEX IF NOT EXISTS idx_chat_interventions_conv_id ON chat_interventions(conversation_id);
    `);

    console.log('✅ Chat repository, voice notes & intervention migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
