const db = require('../db');

async function main() {
  try {
    const res = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trades'
    `);
    console.log('Columns in trades table:');
    console.table(res.rows);
  } catch (error) {
    console.error('Error querying columns:', error);
  } finally {
    process.exit();
  }
}

main();
