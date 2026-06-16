const db = require('../db');

async function main() {
  try {
    const { rows: trades } = await db.query('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 20');
    console.log('=== TRADES ===');
    console.table(trades.map(t => ({
      id: t.id,
      email: t.user_email,
      symbol: t.symbol,
      type: t.type,
      status: t.status,
      price: t.price,
      close_price: t.close_price,
      quantity: t.quantity,
      timestamp: t.timestamp,
      expiry_time: t.expiry_time
    })));

    const { rows: contestTrades } = await db.query('SELECT * FROM contest_trades ORDER BY timestamp DESC LIMIT 20');
    console.log('=== CONTEST TRADES ===');
    console.table(contestTrades.map(ct => ({
      id: ct.id,
      email: ct.user_email,
      symbol: ct.symbol,
      type: ct.type,
      status: ct.status,
      price: ct.price,
      close_price: ct.close_price,
      entry_amount: ct.entry_amount,
      pnl: ct.pnl,
      timestamp: ct.timestamp,
      expiry_time: ct.expiry_time
    })));
  } catch (error) {
    console.error('Error querying tables:', error);
  } finally {
    process.exit();
  }
}

main();
