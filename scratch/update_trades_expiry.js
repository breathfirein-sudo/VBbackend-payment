const db = require('../db');

async function main() {
  try {
    const res = await db.query(`
      UPDATE trades 
      SET expiry_time = '2026-06-15 12:00:00'
      WHERE status = 'OPEN'
      RETURNING *
    `);
    console.log('Updated trades:', res.rows);
  } catch (error) {
    console.error('Error updating trades:', error);
  } finally {
    process.exit();
  }
}

main();
