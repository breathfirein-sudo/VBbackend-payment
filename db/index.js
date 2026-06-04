const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Auto-initialize the trades table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity DECIMAL(10, 4) NOT NULL,
    type VARCHAR(4) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ALTER TABLE trades ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'OPEN';
  ALTER TABLE trades ADD COLUMN IF NOT EXISTS expiry_time TIMESTAMP;
  ALTER TABLE trades ADD COLUMN IF NOT EXISTS close_price DECIMAL(10, 2);
  ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

  CREATE TABLE IF NOT EXISTS contest_participants (
    email VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    balance DECIMAL(18, 2) DEFAULT 11000.00,
    total_trades INTEGER DEFAULT 0,
    profit_trades INTEGER DEFAULT 0,
    loss_trades INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2) DEFAULT 0.00,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contest_trades (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL REFERENCES contest_participants(email) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    quantity DECIMAL(18, 8) NOT NULL,
    type VARCHAR(10) NOT NULL,
    status VARCHAR(10) DEFAULT 'OPEN',
    entry_amount DECIMAL(18, 2) NOT NULL,
    expiry_time TIMESTAMP NOT NULL,
    close_price DECIMAL(18, 8),
    pnl DECIMAL(18, 2) DEFAULT 0.00,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).catch(err => console.error('Error auto-creating database tables:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
};
