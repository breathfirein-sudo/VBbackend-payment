const db = require('./db');
const query = process.argv.slice(2).join(' ');

if (!query) {
  console.log("Usage: node db_shell.js \"YOUR SQL QUERY\"");
  process.exit(1);
}

async function run() {
  try {
    console.log(`Executing: ${query}\n`);
    const result = await db.query(query);
    
    if (result.rows && result.rows.length > 0) {
      console.table(result.rows);
      console.log(`\nRows returned: ${result.rowCount}`);
    } else if (result.rows) {
      console.log("Query executed successfully. 0 rows returned.");
    } else {
      console.log(result);
    }
  } catch (err) {
    console.error("❌ SQL ERROR:", err.message);
  } finally {
    process.exit(0);
  }
}
run();
