const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting messages & conversations database migration...');

    // 1. جدول قنوات ومحادثات المشاريع
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        type VARCHAR(50) DEFAULT 'project_channel', -- project_channel, direct_chat
        last_message_text TEXT,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. جدول المشاركين في كل محادثة
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (conversation_id, user_id)
      );
    `);

    // 3. جدول الرسائل المتبادلة
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message_text TEXT NOT NULL,
        attachment_url TEXT,
        attachment_name VARCHAR(255),
        attachment_type VARCHAR(50),
        attachment_size VARCHAR(50),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. إنشاء الفهارس
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
      CREATE INDEX IF NOT EXISTS idx_conv_participants_user_id ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
    `);

    console.log('✅ Messages & conversations migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Messages migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
