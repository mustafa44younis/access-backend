const db = require('../config/db');

const migrate = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(30) NOT NULL,
        provider_id VARCHAR(255) NOT NULL,
        email VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (provider, provider_id),
        UNIQUE (provider, user_id)
      );
    `);

    console.log('✅ oauth_accounts table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
