const axios = require('axios');
const db = require('../db');

const backendUrl = 'http://localhost:5000';

async function main() {
  try {
    const email = 'abrarali99890@gmail.com';
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      email,
      password: 'Password123'
    });
    const token = loginRes.data.token;
    const headers = { headers: { Authorization: `Bearer ${token}` } };

    console.log('2. Registering for the contest...');
    await axios.post(`${backendUrl}/api/contest/register`, {}, headers).catch(() => {});

    // Ensure user has enough contest balance (credit 11000)
    console.log('Ensure sufficient tournament balance...');
    await db.query('UPDATE contest_participants SET balance = balance + 1000 WHERE email = $1', [email]);

    // Fetch current TSLA price
    console.log('3. Fetching current market price for TSLA...');
    const chartRes = await axios.get(`${backendUrl}/api/chart/TSLA/1m`);
    const currentPrice = chartRes.data[chartRes.data.length - 1].close;
    console.log(`Current price: ${currentPrice}`);

    console.log('4. Placing a tournament BUY trade...');
    const tradeRes = await axios.post(`${backendUrl}/api/contest/trade`, {
      symbol: 'TSLA',
      price: currentPrice,
      type: 'BUY',
      entryAmount: 100,
      interval: '1m'
    }, headers);

    const placedTrade = tradeRes.data.trade;
    console.log('Contest Trade placed successfully:');
    console.log({
      id: placedTrade.id,
      symbol: placedTrade.symbol,
      price: placedTrade.price,
      quantity: placedTrade.quantity,
      status: placedTrade.status,
      entry_amount: placedTrade.entry_amount,
      expiry_time: placedTrade.expiry_time
    });

    // Check raw values in DB
    const { rows: dbRowsBefore } = await db.query('SELECT expiry_time::text, (expiry_time <= CURRENT_TIMESTAMP) as is_expired FROM contest_trades WHERE id = $1', [placedTrade.id]);
    console.log('\nInitial database values:');
    console.log(`Stored expiry_time (raw text): ${dbRowsBefore[0].expiry_time}`);
    console.log(`Is expired in DB? ${dbRowsBefore[0].is_expired}`);

    console.log('\n5. Waiting 65 seconds for trade resolution...');
    await new Promise(resolve => setTimeout(resolve, 65000));

    console.log('6. Checking if contest trade has resolved...');
    const { rows: dbRowsAfter } = await db.query('SELECT status, close_price, pnl, expiry_time::text, (expiry_time <= CURRENT_TIMESTAMP) as is_expired FROM contest_trades WHERE id = $1', [placedTrade.id]);
    console.log('Final database values:');
    console.log(`Status: ${dbRowsAfter[0].status}`);
    console.log(`Close Price: ${dbRowsAfter[0].close_price}`);
    console.log(`PnL: ${dbRowsAfter[0].pnl}`);
    console.log(`Stored expiry_time (raw text): ${dbRowsAfter[0].expiry_time}`);
    console.log(`Is expired in DB? ${dbRowsAfter[0].is_expired}`);

    if (dbRowsAfter[0].status !== 'OPEN') {
      console.log('\n✅ Tournament Trade Verification Successful! Trade successfully resolved live.');
    } else {
      console.log('\n❌ Verification Failed: Contest trade is still OPEN.');
    }

  } catch (error) {
    console.error('Contest Verification error:', error.message || error);
    if (error.response) {
      console.error('Server response data:', error.response.data);
    }
  } finally {
    process.exit();
  }
}

main();
