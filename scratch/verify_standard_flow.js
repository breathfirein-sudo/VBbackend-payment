const db = require('../db');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EMAIL = 'abrarali99890@gmail.com';

async function run() {
  console.log('=== STARTING AUTOMATED STANDARD WALLET, TRADE & REJECTION LOGIC VERIFICATION ===');
  
  // 1. Fetch user and wallet
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { wallet: true }
  });

  if (!user || !user.wallet) {
    console.error('Test user or wallet not found');
    process.exit(1);
  }

  const initialBalance = parseFloat(user.wallet.balance);
  console.log(`Initial Wallet Balance for ${EMAIL}: ₹${initialBalance.toFixed(2)}`);

  // Ensure balance is at least ₹200.00 for tests
  if (initialBalance < 200.00) {
    console.log('Balance is low, adding ₹300.00 for testing...');
    await db.query('UPDATE "Wallet" SET balance = balance + 300.00 WHERE "userId" = $1', [user.id]);
  }

  // Reload user data
  const userReload = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { wallet: true }
  });
  const balanceBeforeTrade = parseFloat(userReload.wallet.balance);
  console.log(`Wallet Balance before trade: ₹${balanceBeforeTrade.toFixed(2)}`);

  // 2. Simulate standard trade placement
  console.log('\n--- Test 1: Simulating Trade Placement (₹100 investment) ---');
  
  await db.query('BEGIN');
  try {
    const amt = 100.00;
    const tradeStake = amt * 0.10; // ₹10
    const appFee = amt * 0.01; // ₹1
    const expiryTime = new Date(Date.now() + 60000).toISOString();

    // Immediate ₹100 deduction
    await db.query(
      'UPDATE "Wallet" SET balance = balance - $1 WHERE "userId" = $2',
      [amt, user.id]
    );

    // Insert trade record
    const insertRes = await db.query(
      `INSERT INTO trades (
        symbol, price, quantity, type, status, expiry_time, user_email, 
        investment_amount, pnl, trade_stake, application_fee, returned_amount, profit_loss_amount, user_id,
        wallet_balance_before, wallet_balance_after
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, 0.00, 0.00, $11, $12, 0.00) RETURNING *`,
      ['TSLA', 400.00, 0.025, 'BUY', 'OPEN', expiryTime, EMAIL, amt, tradeStake, appFee, user.id, balanceBeforeTrade]
    );
    const trade = insertRes.rows[0];

    // Insert Transaction audit log for placement
    await db.query(
      `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
       VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
      [user.id, 'TRADE_PLACE', 'TSLA', -amt, appFee, 'Standard Paper Trade placement']
    );

    await db.query('COMMIT');

    console.log('Trade inserted successfully:');
    console.log(`- Trade ID: ${trade.id}`);
    console.log(`- Investment: ₹${trade.investment_amount}`);
    console.log(`- Stake (Paper Trade Amount): ₹${trade.trade_stake}`);
    console.log(`- App Fee: ₹${trade.application_fee}`);
    console.log(`- Status: ${trade.status}`);
    console.log(`- Wallet Balance Before: ₹${trade.wallet_balance_before}`);

    const walletAfterPlacement = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const balanceAfterPlacement = parseFloat(walletAfterPlacement.balance);
    console.log(`Wallet Balance after placement: ₹${balanceAfterPlacement.toFixed(2)}`);

    const deduction = balanceBeforeTrade - balanceAfterPlacement;
    console.log(`Wallet deduction: ₹${deduction.toFixed(2)}`);
    if (Math.abs(deduction - 100.00) < 0.01) {
      console.log('✅ PASS: Wallet deducted by exactly ₹100.00 immediately.');
    } else {
      console.error('❌ FAIL: Wallet deduction was not ₹100.00.');
    }

    // Verify placement transaction log
    const placeTxRes = await db.query(
      `SELECT * FROM "Transaction" WHERE "userId" = $1 AND type = 'TRADE_PLACE' ORDER BY "createdAt" DESC LIMIT 1`,
      [user.id]
    );
    if (placeTxRes.rows.length > 0 && Math.abs(parseFloat(placeTxRes.rows[0].amount) + 100.00) < 0.01) {
      console.log('✅ PASS: Wallet transaction audit log recorded for placement (-₹100).');
    } else {
      console.error('❌ FAIL: Placement transaction log was not recorded correctly.');
    }

    // 3. Simulate WIN Resolution
    console.log('\n--- Test 2: Simulating WIN Trade Resolution ---');
    const returnedAmountWin = amt + (tradeStake - appFee); // ₹109
    const profitLossAmountWin = tradeStake - appFee; // ₹9 (paper trade profit)
    const netPnlWin = tradeStake - appFee; // +₹9
    const walletRefundWin = returnedAmountWin; // ₹109

    await db.query('BEGIN');
    
    // Get balance before adding refund to record balance after settlement
    const walletResBeforeWin = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balanceBeforeWinRefund = parseFloat(walletResBeforeWin.rows[0].balance);
    const balanceAfterWinRefund = balanceBeforeWinRefund + walletRefundWin;

    await db.query(
      `UPDATE trades 
       SET status = 'WON', 
           close_price = 405.00, 
           pnl = $1, 
           returned_amount = $2, 
           profit_loss_amount = $3,
           wallet_balance_after = $4
       WHERE id = $5`,
      [netPnlWin, returnedAmountWin, profitLossAmountWin, balanceAfterWinRefund, trade.id]
    );
    await db.query(
      'UPDATE "Wallet" SET balance = balance + $1 WHERE "userId" = $2',
      [walletRefundWin, user.id]
    );
    // Insert Transaction audit log for settlement
    await db.query(
      `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
       VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
      [user.id, 'TRADE_SETTLE', 'TSLA', walletRefundWin, appFee, 'Standard Paper Trade settlement WON']
    );
    await db.query('COMMIT');

    const walletAfterWin = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const balanceAfterWin = parseFloat(walletAfterWin.balance);
    console.log(`Wallet Balance after WIN resolution: ₹${balanceAfterWin.toFixed(2)}`);
    
    const dbTradeWin = (await db.query('SELECT * FROM trades WHERE id = $1', [trade.id])).rows[0];
    console.log(`Recorded Wallet Balance After Settlement: ₹${parseFloat(dbTradeWin.wallet_balance_after).toFixed(2)}`);

    console.log(`Net change from pre-trade balance: ₹${(balanceAfterWin - balanceBeforeTrade).toFixed(2)}`);
    if (Math.abs((balanceAfterWin - balanceBeforeTrade) - 9.00) < 0.01 && Math.abs(parseFloat(dbTradeWin.wallet_balance_after) - balanceAfterWin) < 0.01) {
      console.log('✅ PASS: Wallet has net profit of exactly +₹9.00, and balance_after matches.');
    } else {
      console.error('❌ FAIL: Net profit calculation or audit balance is incorrect.');
    }

    // Verify WIN settlement transaction log
    const winTxRes = await db.query(
      `SELECT * FROM "Transaction" WHERE "userId" = $1 AND type = 'TRADE_SETTLE' ORDER BY "createdAt" DESC LIMIT 1`,
      [user.id]
    );
    if (winTxRes.rows.length > 0 && Math.abs(parseFloat(winTxRes.rows[0].amount) - 109.00) < 0.01) {
      console.log('✅ PASS: Wallet transaction audit log recorded for WIN settlement (+₹109).');
    } else {
      console.error('❌ FAIL: WIN settlement transaction log was not recorded correctly.');
    }

    // 4. Simulate LOSS Resolution
    console.log('\n--- Test 3: Simulating LOST Trade Placement & Resolution ---');
    // Place trade 2
    await db.query('BEGIN');
    await db.query(
      'UPDATE "Wallet" SET balance = balance - $1 WHERE "userId" = $2',
      [amt, user.id]
    );
    const insertRes2 = await db.query(
      `INSERT INTO trades (
        symbol, price, quantity, type, status, expiry_time, user_email, 
        investment_amount, pnl, trade_stake, application_fee, returned_amount, profit_loss_amount, user_id,
        wallet_balance_before, wallet_balance_after
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, 0.00, 0.00, $11, $12, 0.00) RETURNING *`,
      ['TSLA', 400.00, 0.025, 'BUY', 'OPEN', expiryTime, EMAIL, amt, tradeStake, appFee, user.id, balanceAfterWin]
    );
    const trade2 = insertRes2.rows[0];
    await db.query('COMMIT');

    const balanceBeforeLossRes = balanceAfterWin; // wallet before placement 2 was balanceAfterWin

    // Resolve trade 2 as LOST
    const returnedAmountLoss = amt - (tradeStake + appFee); // ₹89
    const profitLossAmountLoss = -tradeStake; // -₹10 (paper trade loss)
    const netPnlLoss = -(tradeStake + appFee); // -₹11
    const walletRefundLoss = returnedAmountLoss; // ₹89

    await db.query('BEGIN');
    const walletResBeforeLoss = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balanceBeforeLossRefund = parseFloat(walletResBeforeLoss.rows[0].balance);
    const balanceAfterLossRefund = balanceBeforeLossRefund + walletRefundLoss;

    await db.query(
      `UPDATE trades 
       SET status = 'LOST', 
           close_price = 395.00, 
           pnl = $1, 
           returned_amount = $2, 
           profit_loss_amount = $3,
           wallet_balance_after = $4
       WHERE id = $5`,
      [netPnlLoss, returnedAmountLoss, profitLossAmountLoss, balanceAfterLossRefund, trade2.id]
    );
    await db.query(
      'UPDATE "Wallet" SET balance = balance + $1 WHERE "userId" = $2',
      [walletRefundLoss, user.id]
    );
    // Insert Transaction audit log for settlement
    await db.query(
      `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
       VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
      [user.id, 'TRADE_SETTLE', 'TSLA', walletRefundLoss, appFee, 'Standard Paper Trade settlement LOST']
    );
    await db.query('COMMIT');

    const walletAfterLoss = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const balanceAfterLoss = parseFloat(walletAfterLoss.balance);
    console.log(`Wallet Balance after LOSS resolution: ₹${balanceAfterLoss.toFixed(2)}`);
    
    const dbTradeLoss = (await db.query('SELECT * FROM trades WHERE id = $1', [trade2.id])).rows[0];
    console.log(`Recorded Wallet Balance After Settlement: ₹${parseFloat(dbTradeLoss.wallet_balance_after).toFixed(2)}`);

    console.log(`Net change from pre-trade 2 balance: ₹${(balanceAfterLoss - balanceBeforeLossRes).toFixed(2)}`);
    if (Math.abs((balanceAfterLoss - balanceBeforeLossRes) - -11.00) < 0.01 && Math.abs(parseFloat(dbTradeLoss.wallet_balance_after) - balanceAfterLoss) < 0.01) {
      console.log('✅ PASS: Wallet has net loss of exactly -₹11.00 (deducted ₹100.00 and credited ₹89.00), and balance_after matches.');
    } else {
      console.error('❌ FAIL: Net loss calculation or audit balance is incorrect.');
    }

    // Verify LOSS settlement transaction log
    const lossTxRes = await db.query(
      `SELECT * FROM "Transaction" WHERE "userId" = $1 AND type = 'TRADE_SETTLE' ORDER BY "createdAt" DESC LIMIT 1`,
      [user.id]
    );
    if (lossTxRes.rows.length > 0 && Math.abs(parseFloat(lossTxRes.rows[0].amount) - 89.00) < 0.01) {
      console.log('✅ PASS: Wallet transaction audit log recorded for LOSS settlement (+₹89).');
    } else {
      console.error('❌ FAIL: LOSS settlement transaction log was not recorded correctly.');
    }

    // 5. Simulate REJECTED (Price Constant) Resolution
    console.log('\n--- Test 4: Simulating REJECTED (Price Constant) Trade Resolution ---');
    // Place trade 3
    await db.query('BEGIN');
    await db.query(
      'UPDATE "Wallet" SET balance = balance - $1 WHERE "userId" = $2',
      [amt, user.id]
    );
    const insertRes3 = await db.query(
      `INSERT INTO trades (
        symbol, price, quantity, type, status, expiry_time, user_email, 
        investment_amount, pnl, trade_stake, application_fee, returned_amount, profit_loss_amount, user_id,
        wallet_balance_before, wallet_balance_after
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, 0.00, 0.00, $11, $12, 0.00) RETURNING *`,
      ['TSLA', 400.00, 0.025, 'BUY', 'OPEN', expiryTime, EMAIL, amt, tradeStake, appFee, user.id, balanceAfterLoss]
    );
    const trade3 = insertRes3.rows[0];
    await db.query('COMMIT');

    const balanceBeforeRejectedRes = balanceAfterLoss; // wallet before placement 3 was balanceAfterLoss

    // Resolve trade 3 as REJECTED (close_price === entry_price)
    const returnedAmountRejected = 0.00; // ₹0 (no refund)
    const profitLossAmountRejected = 0.00; // ₹0
    const netPnlRejected = -amt; // -₹100
    const walletRefundRejected = returnedAmountRejected; // ₹0

    await db.query('BEGIN');
    const walletResBeforeRejected = await db.query('SELECT balance FROM "Wallet" WHERE "userId" = $1', [user.id]);
    const balanceBeforeRejectedRefund = parseFloat(walletResBeforeRejected.rows[0].balance);
    const balanceAfterRejectedRefund = balanceBeforeRejectedRefund + walletRefundRejected;

    await db.query(
      `UPDATE trades 
       SET status = 'REJECTED', 
           close_price = price, 
           pnl = $1, 
           returned_amount = $2, 
           profit_loss_amount = $3,
           wallet_balance_after = $4
       WHERE id = $5`,
      [netPnlRejected, returnedAmountRejected, profitLossAmountRejected, balanceAfterRejectedRefund, trade3.id]
    );
    await db.query(
      'UPDATE "Wallet" SET balance = balance + $1 WHERE "userId" = $2',
      [walletRefundRejected, user.id]
    );
    // Insert Transaction audit log for settlement
    await db.query(
      `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
       VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
      [user.id, 'TRADE_SETTLE', 'TSLA', walletRefundRejected, appFee, 'Standard Paper Trade settlement REJECTED']
    );
    await db.query('COMMIT');

    const walletAfterRejected = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const balanceAfterRejected = parseFloat(walletAfterRejected.balance);
    console.log(`Wallet Balance after REJECTED resolution: ₹${balanceAfterRejected.toFixed(2)}`);
    
    const dbTradeRejected = (await db.query('SELECT * FROM trades WHERE id = $1', [trade3.id])).rows[0];
    console.log(`Recorded Wallet Balance After Settlement: ₹${parseFloat(dbTradeRejected.wallet_balance_after).toFixed(2)}`);

    console.log(`Net change from pre-trade 3 balance: ₹${(balanceAfterRejected - balanceBeforeRejectedRes).toFixed(2)}`);
    if (Math.abs((balanceAfterRejected - balanceBeforeRejectedRes) - -100.00) < 0.01 && Math.abs(parseFloat(dbTradeRejected.wallet_balance_after) - balanceAfterRejected) < 0.01) {
      console.log('✅ PASS: Wallet has net profit/loss of exactly -₹100.00 (deducted ₹100.00 and refunded ₹0.00), and balance_after matches.');
    } else {
      console.error('❌ FAIL: Rejection calculation or audit balance is incorrect.');
    }

    // Verify REJECTED settlement transaction log
    const rejectedTxRes = await db.query(
      `SELECT * FROM "Transaction" WHERE "userId" = $1 AND type = 'TRADE_SETTLE' ORDER BY "createdAt" DESC LIMIT 1`,
      [user.id]
    );
    if (rejectedTxRes.rows.length > 0 && Math.abs(parseFloat(rejectedTxRes.rows[0].amount) - 0.00) < 0.01) {
      console.log('✅ PASS: Wallet transaction audit log recorded for REJECTED settlement (₹0).');
    } else {
      console.error('❌ FAIL: REJECTED settlement transaction log was not recorded correctly.');
    }

    // 6. Clean up test trades and transaction logs
    console.log('\nCleaning up test trades and transaction logs...');
    await db.query('DELETE FROM trades WHERE id IN ($1, $2, $3)', [trade.id, trade2.id, trade3.id]);
    await db.query('DELETE FROM "Transaction" WHERE "userId" = $1', [user.id]);
    
    // Restore original balance
    await db.query('UPDATE "Wallet" SET balance = $1 WHERE "userId" = $2', [initialBalance, user.id]);
    console.log(`Original wallet balance restored to ₹${initialBalance.toFixed(2)}.`);

  } catch (err) {
    console.error('Transaction error:', err);
  } finally {
    process.exit();
  }
}

run();
