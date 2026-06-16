const axios = require('axios');
const db = require('../db');

const backendUrl = 'http://localhost:5000';

async function main() {
  try {
    console.log('1. Logging in as abrarali99890@gmail.com...');
    const loginRes = await axios.post(`${backendUrl}/api/auth/login`, {
      email: 'abrarali99890@gmail.com',
      password: 'Password123'
    });
    
    const token = loginRes.data.token;
    console.log('Login successful. JWT token acquired.');

    const headers = { headers: { Authorization: `Bearer ${token}` } };

    // Fetch current wallet balance before trade
    const userRes1 = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = 40');
    const balanceBefore = parseFloat(userRes1.rows[0].balance);
    console.log(`User Wallet balance before trade: ₹${balanceBefore}`);

    // Get current price of TSLA
    console.log('2. Fetching current market price for TSLA...');
    const chartRes = await axios.get(`${backendUrl}/api/chart/TSLA/1m`);
    const currentPrice = chartRes.data[chartRes.data.length - 1].close;
    console.log(`Current TSLA price: ${currentPrice}`);

    const investment = 100;
    console.log(`3. Placing a standard BUY trade with ₹${investment} investment...`);
    const tradeRes = await axios.post(`${backendUrl}/api/buy`, {
      symbol: 'TSLA',
      price: currentPrice,
      investmentAmount: investment,
      interval: '1m'
    }, headers);

    const placedTrade = tradeRes.data;
    console.log('Trade placed successfully:');
    console.dir(placedTrade);

    // Verify wallet balance is deducted immediately
    const userRes2 = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = 40');
    const balanceAfterPlacement = parseFloat(userRes2.rows[0].balance);
    console.log(`User Wallet balance after placement: ₹${balanceAfterPlacement}`);
    const expectedDeductedBalance = balanceBefore - investment;
    console.log(`Expected balance: ₹${expectedDeductedBalance}`);

    if (Math.abs(balanceAfterPlacement - expectedDeductedBalance) < 0.01) {
      console.log('✅ Balance deduction verification successful!');
    } else {
      console.log('❌ Balance deduction verification failed!');
    }

    // Check raw values in DB
    const { rows: dbRowsBefore } = await db.query('SELECT expiry_time::text, (expiry_time <= CURRENT_TIMESTAMP) as is_expired, investment_amount FROM trades WHERE id = $1', [placedTrade.id]);
    console.log('\nInitial database values:');
    console.log(`Stored expiry_time (raw text): ${dbRowsBefore[0].expiry_time}`);
    console.log(`Investment amount in DB: ${dbRowsBefore[0].investment_amount}`);
    console.log(`Is expired in DB? ${dbRowsBefore[0].is_expired}`);

    console.log('\n4. Waiting 65 seconds for trade resolution...');
    await new Promise(resolve => setTimeout(resolve, 65000));

    console.log('5. Checking if trade has resolved...');
    const { rows: dbRowsAfter } = await db.query('SELECT status, close_price, pnl, expiry_time::text, (expiry_time <= CURRENT_TIMESTAMP) as is_expired FROM trades WHERE id = $1', [placedTrade.id]);
    console.log('Final database values:');
    console.log(`Status: ${dbRowsAfter[0].status}`);
    console.log(`Close Price: ${dbRowsAfter[0].close_price}`);
    console.log(`PnL: ${dbRowsAfter[0].pnl}`);
    console.log(`Stored expiry_time (raw text): ${dbRowsAfter[0].expiry_time}`);
    console.log(`Is expired in DB? ${dbRowsAfter[0].is_expired}`);

    // Check wallet balance after resolution
    const userRes3 = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = 40');
    const balanceAfterResolution = parseFloat(userRes3.rows[0].balance);
    console.log(`User Wallet balance after resolution: ₹${balanceAfterResolution}`);

    let expectedFinalBalance = expectedDeductedBalance;
    if (dbRowsAfter[0].status === 'WON') {
      expectedFinalBalance += investment * 1.10;
    } else if (dbRowsAfter[0].status === 'LOST') {
      expectedFinalBalance += investment * 0.90;
    } else {
      expectedFinalBalance += investment;
    }
    console.log(`Expected resolved balance: ₹${expectedFinalBalance}`);

    if (Math.abs(balanceAfterResolution - expectedFinalBalance) < 0.01) {
      console.log('✅ Wallet resolution balance credit verification successful!');
    } else {
      console.log('❌ Wallet resolution balance credit verification failed!');
    }

    if (dbRowsAfter[0].status !== 'OPEN') {
      console.log('\n✅ End-to-end Verification Successful! Trade successfully resolved live.');
    } else {
      console.log('\n❌ Verification Failed: Trade is still OPEN.');
    }

  } catch (error) {
    console.error('E2E Verification error:', error.message || error);
    if (error.response) {
      console.error('Server response data:', error.response.data);
    }
  } finally {
    process.exit();
  }
}

main();
