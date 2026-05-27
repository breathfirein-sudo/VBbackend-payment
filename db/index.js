const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: 'postgresql://postgres:Abrar@123@localhost:5432/vb2'
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
`).catch(err => console.error('Error auto-creating trades table:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
};
