const { Pool } = require('pg');
require('dotenv').config();
console.log("DATABASE_URL:", process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});
pool.query('SELECT NOW()', (err, res) => {
  console.log("Result error:", err);
  console.log("Result rows:", res?.rows);
  pool.end();
});
