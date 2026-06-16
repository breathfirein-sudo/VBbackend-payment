const db = require('../db');
const { PrismaClient } = require('@prisma/client');
const globalPrisma = new PrismaClient();
const { getFinnhubCandles } = require('../services/finnhub');

async function main() {
  try {
    const tradeId = 1; // From the failed test output
    console.log(`Loading contest trade ID ${tradeId}...`);
    const { rows: trades } = await db.query('SELECT * FROM contest_trades WHERE id = $1', [tradeId]);
    if (trades.length === 0) {
      console.log('Trade not found.');
      return;
    }
    const trade = trades[0];
    console.log('Trade loaded:', trade);

    // Mimic the background worker resolution
    console.log('Fetching candles for TSLA...');
    const candles = await getFinnhubCandles(trade.symbol, '1m', 1);
    if (!candles || candles.length === 0) {
      console.log('No candles fetched.');
      return;
    }

    const currentPrice = candles[candles.length - 1].close;
    console.log(`Current price fetched: ${currentPrice}`);

    let newStatus = 'TIE';
    let pnl = 0;
    const entryAmount = parseFloat(trade.entry_amount);

    if (trade.type === 'BUY') {
      if (currentPrice > trade.price) {
        newStatus = 'WON';
        pnl = entryAmount * 0.8;
      } else if (currentPrice < trade.price) {
        newStatus = 'LOST';
        pnl = -entryAmount;
      }
    } else if (trade.type === 'SELL') {
      if (currentPrice < trade.price) {
        newStatus = 'WON';
        pnl = entryAmount * 0.8;
      } else if (currentPrice > trade.price) {
        newStatus = 'LOST';
        pnl = -entryAmount;
      }
    }

    console.log(`Simulated Outcome: Status = ${newStatus}, PnL = ${pnl}`);

    console.log('Beginning transaction to resolve trade...');
    await db.query('BEGIN');

    console.log('1. Updating contest_trades...');
    await db.query(
      "UPDATE contest_trades SET status = $1, close_price = $2, pnl = $3 WHERE id = $4",
      [newStatus, currentPrice, pnl, trade.id]
    );

    const isWin = newStatus === 'WON';
    const isLoss = newStatus === 'LOST';
    
    let refundAmount = 0;
    if (isWin) {
      refundAmount = 20; // 10 risk + 10 profit
    } else if (isLoss) {
      refundAmount = 9;  // 10 risk - 1 lost
    } else if (newStatus === 'TIE') {
      refundAmount = 10; // return risk
    }

    if (isLoss) {
      console.log('2. Updating Admin wallet via Prisma (Loss)...');
      await globalPrisma.user.update({
        where: { email: 'sandeepkumar.pikili@vrpigroup.co.in' },
        data: { wallet: { update: { balance: { increment: 1 } } } }
      });
    }

    console.log(`3. Updating contest_participants with refundAmount: ${refundAmount}...`);
    await db.query(
      `UPDATE contest_participants 
       SET balance = balance + $1,
           total_trades = total_trades + 1,
           profit_trades = profit_trades + $2,
           loss_trades = loss_trades + $3,
           success_rate = ((profit_trades + $2)::numeric / (total_trades + 1)) * 100
       WHERE email = $4`,
      [
        refundAmount,
        isWin ? 1 : 0,
        isLoss ? 1 : 0,
        trade.user_email
      ]
    );

    console.log('Committing transaction...');
    await db.query('COMMIT');
    console.log('Transaction committed successfully! Trade resolved.');

  } catch (error) {
    console.log('Transaction failed! Rolling back...');
    await db.query('ROLLBACK').catch(() => {});
    console.error('Error during resolution:', error);
  } finally {
    await globalPrisma.$disconnect();
    process.exit();
  }
}

main();
