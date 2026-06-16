const db = require('../db');

async function main() {
  try {
    console.log('Altering trades table to add new calculation fields...');
    
    await db.query(`
      ALTER TABLE trades 
      ADD COLUMN IF NOT EXISTS trade_stake DECIMAL(10, 2) DEFAULT 10.00,
      ADD COLUMN IF NOT EXISTS application_fee DECIMAL(10, 2) DEFAULT 1.00,
      ADD COLUMN IF NOT EXISTS returned_amount DECIMAL(10, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS profit_loss_amount DECIMAL(10, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);

    console.log('Trades table altered successfully!');
  } catch (error) {
    console.error('Failed to alter trades table:', error.message);
  } finally {
    process.exit();
  }
}

main();
