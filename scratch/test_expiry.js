const db = require('../db');

async function main() {
  try {
    const resTime = await db.query('SELECT CURRENT_TIMESTAMP, NOW()');
    console.log('Database Timestamps:', resTime.rows[0]);

    const { rows: openTrades } = await db.query("SELECT id, status, expiry_time, CURRENT_TIMESTAMP, expiry_time <= CURRENT_TIMESTAMP as is_expired FROM trades WHERE status = 'OPEN'");
    console.log('Open trades check:');
    console.table(openTrades);
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    process.exit();
  }
}

main();
