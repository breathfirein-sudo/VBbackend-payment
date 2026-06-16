const db = require('../db');

async function main() {
  try {
    const res = await db.query(`
      SELECT 
        expiry_time,
        pg_typeof(expiry_time) as type_expiry_time,
        CURRENT_TIMESTAMP as current_timestamp,
        pg_typeof(CURRENT_TIMESTAMP) as type_current_timestamp,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') as current_timestamp_utc,
        pg_typeof(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') as type_current_timestamp_utc,
        expiry_time <= CURRENT_TIMESTAMP as comp_standard,
        expiry_time <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') as comp_utc,
        expiry_time <= NOW() as comp_now,
        expiry_time <= CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata' as comp_kolkata,
        (SELECT NOW()) as now_val
      FROM trades 
      WHERE id = 1
    `);
    console.log('Postgres timezone comparison detailed check:');
    console.log(res.rows[0]);
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    process.exit();
  }
}

main();
