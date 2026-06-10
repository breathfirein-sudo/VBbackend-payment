const db = require('./db');

async function test() {
  try {
    const result = await db.query(
      "INSERT INTO trades (symbol, price, quantity, type, status, expiry_time) VALUES ('TSLA', 200, 1, 'BUY', 'OPEN', NOW()) RETURNING *"
    );
    console.log('SUCCESS:', result.rows[0]);
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    process.exit();
  }
}
test();
