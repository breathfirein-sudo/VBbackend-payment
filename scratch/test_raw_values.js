const db = require('../db');

async function main() {
  try {
    const res = await db.query(`
      SELECT 
        id,
        expiry_time::text as raw_expiry_time,
        CURRENT_TIMESTAMP::text as raw_current_timestamp,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text as raw_current_timestamp_utc,
        (expiry_time <= CURRENT_TIMESTAMP) as comp_standard,
        (expiry_time::timestamp with time zone) as expiry_timestamptz,
        (expiry_time::timestamp with time zone)::text as raw_expiry_timestamptz
      FROM trades 
      WHERE id = 1
    `);
    console.log('Postgres raw text check:');
    console.log(res.rows[0]);
  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    process.exit();
  }
}

main();
