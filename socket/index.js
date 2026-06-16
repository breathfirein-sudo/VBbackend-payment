const { getFinnhubCandles } = require('../services/finnhub');
const { getOrStartTracker, getCurrentPrice } = require('../services/livePriceTracker');
const db = require('../db');
const { PrismaClient } = require('@prisma/client');
const globalPrisma = new PrismaClient();

// Map frontend interval strings to milliseconds for polling
const getPollingFrequency = (intv) => {
  if (intv.includes('m')) return parseInt(intv) * 60 * 1000;
  if (intv.includes('h')) return parseInt(intv) * 3600 * 1000;
  if (intv.includes('D')) return parseInt(intv) * 86400 * 1000;
  if (intv.includes('W')) return 7 * 86400 * 1000;
  if (intv.includes('M')) return 30 * 86400 * 1000;
  if (intv.includes('R')) return parseInt(intv) * 60 * 1000; // Mock ranges as minutes
  return 60000; // default 1m
};

const setupSocket = (io) => {

  // Global background worker to resolve expired trades
  setInterval(async () => {
    try {
      // 1. Resolve standard paper trades
      const { rows: expiredTrades } = await db.query(
        "SELECT * FROM trades WHERE status = 'OPEN' AND expiry_time <= CURRENT_TIMESTAMP"
      );

      for (let trade of expiredTrades) {
        const investment = parseFloat(trade.investment_amount || 0);

        // Fetch current price for resolution
        const currentPrice = await getCurrentPrice(trade.symbol, '1m');
        if (currentPrice !== null && currentPrice !== undefined) {
          let newStatus = 'REJECTED';
          
          if (trade.type === 'BUY') {
            if (currentPrice > trade.price) newStatus = 'WON';
            else if (currentPrice < trade.price) newStatus = 'LOST';
          } else if (trade.type === 'SELL') {
            if (currentPrice < trade.price) newStatus = 'WON';
            else if (currentPrice > trade.price) newStatus = 'LOST';
          }

          // Calculate returnedAmount, profitLossAmount, and walletRefund using settlement formula
          const tradeStake = parseFloat(trade.trade_stake || 10.00);
          const appFee = parseFloat(trade.application_fee || 1.00);
          
          let returnedAmount = 0.00; // default REJECTED (money will not be refunded)
          let profitLossAmount = 0.00; 
          let netPnl = -investment; // loses full investment
          
          if (newStatus === 'WON') {
            returnedAmount = investment + (tradeStake - appFee); // ₹109 for ₹100
            profitLossAmount = tradeStake - appFee; // ₹9 (paper trade profit)
            netPnl = tradeStake - appFee; // +₹9 net wallet change
          } else if (newStatus === 'LOST') {
            returnedAmount = investment - (tradeStake + appFee); // ₹89 for ₹100
            profitLossAmount = -tradeStake; // -₹10 (paper trade loss)
            netPnl = -(tradeStake + appFee); // -₹11 net wallet change
          } else if (newStatus === 'TIE') {
            returnedAmount = investment - appFee; // ₹99
            profitLossAmount = 0.00;
            netPnl = -appFee;
          }
          
          const walletRefund = returnedAmount;

          await db.query('BEGIN');
          try {
            const userRes = await db.query(
              'SELECT id FROM "User" WHERE email = $1',
              [trade.user_email.toLowerCase()]
            );
            
            let balanceAfter = 0.00;
            if (userRes.rows.length > 0) {
              const userId = userRes.rows[0].id;
              const walletRes = await db.query(
                'SELECT balance FROM "Wallet" WHERE "userId" = $1',
                [userId]
              );
              const currentBalance = parseFloat(walletRes.rows[0].balance || 0);
              balanceAfter = currentBalance + walletRefund;

              // Update user wallet balance
              await db.query(
                'UPDATE "Wallet" SET balance = balance + $1 WHERE "userId" = $2',
                [walletRefund, userId]
              );

              // Update trade record with closed price, pnl, returned_amount, profit_loss_amount, wallet_balance_after
              await db.query(
                `UPDATE trades 
                 SET status = $1, 
                     close_price = $2, 
                     pnl = $3, 
                     returned_amount = $4, 
                     profit_loss_amount = $5,
                     wallet_balance_after = $6
                 WHERE id = $7`,
                [newStatus, currentPrice, netPnl, returnedAmount, profitLossAmount, balanceAfter, trade.id]
              );

              // Record settlement transaction audit log
              await db.query(
                `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
                 VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
                [userId, 'TRADE_SETTLE', trade.symbol, walletRefund, appFee, `Standard Paper Trade settlement credit: ${newStatus}`]
              );
            } else {
              // Fallback update without user id (should not normally happen)
              await db.query(
                `UPDATE trades 
                 SET status = $1, 
                     close_price = $2, 
                     pnl = $3, 
                     returned_amount = $4, 
                     profit_loss_amount = $5
                 WHERE id = $6`,
                [newStatus, currentPrice, netPnl, returnedAmount, profitLossAmount, trade.id]
              );
            }
            await db.query('COMMIT');

            // Broadcast to all clients
            io.emit('trade_resolved', { 
              ...trade, 
              status: newStatus, 
              close_price: currentPrice, 
              pnl: netPnl, 
              returned_amount: returnedAmount,
              profit_loss_amount: profitLossAmount,
              wallet_balance_after: balanceAfter,
              balance_refund: walletRefund 
            });
          } catch (txErr) {
            await db.query('ROLLBACK');
            console.error('Error resolving standard trade:', txErr.message);
          }
        } else {
          // If candles are empty or failed, resolve as REJECTED to prevent infinite loop
          await db.query('BEGIN');
          try {
            const tradeStake = parseFloat(trade.trade_stake || 10.00);
            const appFee = parseFloat(trade.application_fee || 1.00);
            const returnedAmount = investment;
            const profitLossAmount = 0.00;
            const netPnl = 0.00;
            const walletRefund = returnedAmount;

            const userRes = await db.query(
              'SELECT id FROM "User" WHERE email = $1',
              [trade.user_email.toLowerCase()]
            );
            
            let balanceAfter = 0.00;
            if (userRes.rows.length > 0) {
              const userId = userRes.rows[0].id;
              const walletRes = await db.query(
                'SELECT balance FROM "Wallet" WHERE "userId" = $1',
                [userId]
              );
              const currentBalance = parseFloat(walletRes.rows[0].balance || 0);
              balanceAfter = currentBalance + walletRefund;

              await db.query(
                'UPDATE "Wallet" SET balance = balance + $1 WHERE "userId" = $2',
                [walletRefund, userId]
              );

              await db.query(
                `UPDATE trades 
                 SET status = 'REJECTED', 
                     close_price = price, 
                     pnl = $1, 
                     returned_amount = $2, 
                     profit_loss_amount = $3,
                     wallet_balance_after = $4
                 WHERE id = $5`,
                [netPnl, returnedAmount, profitLossAmount, balanceAfter, trade.id]
              );

              await db.query(
                `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
                 VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
                [userId, 'TRADE_SETTLE', trade.symbol, walletRefund, appFee, `Standard Paper Trade settlement credit (Fallback Rejected)`]
              );
            } else {
              await db.query(
                `UPDATE trades 
                 SET status = 'REJECTED', 
                     close_price = price, 
                     pnl = $1, 
                     returned_amount = $2, 
                     profit_loss_amount = $3
                 WHERE id = $4`,
                [netPnl, returnedAmount, profitLossAmount, trade.id]
              );
            }
            await db.query('COMMIT');
            
            io.emit('trade_resolved', { 
              ...trade, 
              status: 'REJECTED', 
              close_price: trade.price, 
              pnl: netPnl, 
              returned_amount: returnedAmount,
              profit_loss_amount: profitLossAmount,
              wallet_balance_after: balanceAfter,
              balance_refund: walletRefund 
            });
          } catch (txErr) {
            await db.query('ROLLBACK');
            console.error('Error resolving failed standard trade:', txErr.message);
          }
        }
      }

      // 2. Resolve contest paper trades
      const { rows: expiredContestTrades } = await db.query(
        "SELECT * FROM contest_trades WHERE status = 'OPEN' AND expiry_time <= CURRENT_TIMESTAMP"
      );

      for (let trade of expiredContestTrades) {
        const currentPrice = await getCurrentPrice(trade.symbol, '1m');
        if (currentPrice !== null && currentPrice !== undefined) {
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

          await db.query('BEGIN');
          try {
            await db.query(
              "UPDATE contest_trades SET status = $1, close_price = $2, pnl = $3 WHERE id = $4",
              [newStatus, currentPrice, pnl, trade.id]
            );

            const isWin = newStatus === 'WON';
            const isLoss = newStatus === 'LOST';
            
            // 100 rupee logic: Only 11 was deducted.
            let refundAmount = 0;
            if (isWin) {
              refundAmount = 20; // 10 risk + 10 profit
            } else if (isLoss) {
              refundAmount = 9;  // 10 risk - 1 lost
            } else if (newStatus === 'TIE') {
              refundAmount = 10; // return risk
            }

            // Transfer 1 rupee to Admin on LOSS
            if (isLoss) {
              await globalPrisma.user.update({
                where: { email: 'sandeepkumar.pikili@vrpigroup.co.in' },
                data: { wallet: { update: { balance: { increment: 1 } } } }
              });
            }

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

            await db.query('COMMIT');

            io.emit('contest_trade_resolved', {
              ...trade,
              status: newStatus,
              close_price: currentPrice,
              pnl,
              balance_refund: refundAmount
            });
          } catch (txErr) {
            await db.query('ROLLBACK');
            console.error('Error executing contest trade resolution transaction:', txErr.message);
          }
        } else {
          // Resolve failed contest trade as TIE and refund risk amount to balance
          await db.query('BEGIN');
          try {
            await db.query(
              "UPDATE contest_trades SET status = 'TIE', close_price = price, pnl = 0.00 WHERE id = $1",
              [trade.id]
            );
            const entryAmount = parseFloat(trade.entry_amount);
            await db.query(
              `UPDATE contest_participants 
               SET balance = balance + $1,
                   total_trades = total_trades + 1
               WHERE email = $2`,
              [entryAmount, trade.user_email]
            );
            await db.query('COMMIT');
            
            io.emit('contest_trade_resolved', {
              ...trade,
              status: 'TIE',
              close_price: trade.price,
              pnl: 0,
              balance_refund: entryAmount
            });
          } catch (txErr) {
            await db.query('ROLLBACK');
            console.error('Error resolving failed contest trade:', txErr.message);
          }
        }
      }

    } catch (err) {
      console.error('Error resolving trades:', err.message);
    }
  }, 2000); // Check every 2 seconds

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let currentTimer = null;
    let activeSymbol = 'TSLA';
    let activeInterval = '1m';

    const startPolling = async () => {
      // Clear previous timer if exists
      if (currentTimer) {
        clearInterval(currentTimer);
      }

      const fetchAndEmit = async () => {
        try {
          const tracker = await getOrStartTracker(activeSymbol, activeInterval);
          if (tracker && tracker.lastCandle) {
            socket.emit('live_candle', tracker.lastCandle);
          }
        } catch (error) {
          console.error('Socket polling error:', error.message);
        }
      };

      // Fetch immediately
      await fetchAndEmit();

      // Poll every 1 second (1000ms) for real-time smooth price action tracking
      const freq = 1000;
      console.log(`Starting live updates for ${activeSymbol} every ${freq}ms (chart interval: ${activeInterval})`);
      currentTimer = setInterval(fetchAndEmit, freq);
    };

    socket.on('subscribe_interval', async ({ symbol, interval }) => {
      activeSymbol = symbol;
      activeInterval = interval;
      console.log(`Client ${socket.id} subscribed to ${symbol} on ${interval}`);
      await startPolling();
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (currentTimer) {
        clearInterval(currentTimer);
      }
    });
  });
};

module.exports = setupSocket;
