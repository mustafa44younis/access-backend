const db = require('../config/db');

const migrate = async () => {
  try {
    console.log('🔄 Starting user profile & settings database migration...');

    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS company_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email_notifications": true, "project_updates": true, "marketing_emails": false}'::jsonb,
      ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'light';
    `);

    console.log('✅ User profile & settings migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
