const db = require('../db');

async function main() {
  try {
    console.log('Altering trades table to add wallet balance tracking columns...');
    await db.query(`
      ALTER TABLE trades 
      ADD COLUMN IF NOT EXISTS wallet_balance_before NUMERIC DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS wallet_balance_after NUMERIC DEFAULT 0.00
    `);
    console.log('Successfully added columns wallet_balance_before and wallet_balance_after.');
  } catch (error) {
    console.error('Error altering table:', error);
  } finally {
    process.exit();
  }
}

main();
