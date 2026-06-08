const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const { rows: participants } = await pool.query('SELECT * FROM contest_participants');
    console.log("Participants:", participants);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
