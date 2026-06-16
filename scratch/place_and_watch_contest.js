const axios = require('axios');
const db = require('../db');

const backendUrl = 'http://localhost:5000';

async function main() {
  try {
    const email = 'abrarali99890@gmail.com';
    console.log('Logging in...');
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      email,
      password: 'Password123'
    });
    const token = loginRes.data.token;
    const headers = { headers: { Authorization: `Bearer ${token}` } };

    console.log('Fetching TSLA price...');
    const chartRes = await axios.get(`${backendUrl}/api/chart/TSLA/1m`);
    const currentPrice = chartRes.data[chartRes.data.length - 1].close;

    console.log(`Placing contest trade at price ${currentPrice}...`);
    const tradeRes = await axios.post(`${backendUrl}/api/contest/trade`, {
      symbol: 'TSLA',
      price: currentPrice,
      type: 'BUY',
      entryAmount: 100,
      interval: '1m'
    }, headers);

    const tradeId = tradeRes.data.trade.id;
    console.log(`Trade placed. ID: ${tradeId}. Expiry: ${tradeRes.data.trade.expiry_time}`);

    console.log('Watching database for 80 seconds...');
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { rows } = await db.query(
        "SELECT status, close_price, pnl, expiry_time::text, (expiry_time <= CURRENT_TIMESTAMP) as is_expired, CURRENT_TIMESTAMP::text as db_now FROM contest_trades WHERE id = $1",
        [tradeId]
      );
      const t = rows[0];
      console.log(`[${i*5}s] Status: ${t.status} | Expired: ${t.is_expired} | PnL: ${t.pnl} | Now: ${t.db_now.split(' ')[1]}`);
      if (t.status !== 'OPEN') {
        console.log('✅ Resolved automatically!');
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

main();
