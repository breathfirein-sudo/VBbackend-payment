const { getFinnhubCandles } = require('../services/finnhub');
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
        // Fetch current price for resolution
        const candles = await getFinnhubCandles(trade.symbol, '1m', 1);
        if (candles && candles.length > 0) {
          const currentPrice = candles[candles.length - 1].close;
          let newStatus = 'TIE';
          
          if (trade.type === 'BUY') {
            if (currentPrice > trade.price) newStatus = 'WON';
            else if (currentPrice < trade.price) newStatus = 'LOST';
          } else if (trade.type === 'SELL') {
            if (currentPrice < trade.price) newStatus = 'WON';
            else if (currentPrice > trade.price) newStatus = 'LOST';
          }

          await db.query(
            "UPDATE trades SET status = $1, close_price = $2 WHERE id = $3",
            [newStatus, currentPrice, trade.id]
          );

          // Broadcast to all clients
          io.emit('trade_resolved', { ...trade, status: newStatus, close_price: currentPrice });
        } else {
          // If candles are empty, Yahoo Finance failed or symbol is delisted.
          // Resolve as TIE to prevent infinite loop spamming the server
          await db.query(
            "UPDATE trades SET status = 'TIE', close_price = price WHERE id = $1",
            [trade.id]
          );
          io.emit('trade_resolved', { ...trade, status: 'TIE', close_price: trade.price });
        }
      }

      // 2. Resolve contest paper trades
      const { rows: expiredContestTrades } = await db.query(
        "SELECT * FROM contest_trades WHERE status = 'OPEN' AND expiry_time <= CURRENT_TIMESTAMP"
      );

      for (let trade of expiredContestTrades) {
        const candles = await getFinnhubCandles(trade.symbol, '1m', 1);
        if (candles && candles.length > 0) {
          const currentPrice = candles[candles.length - 1].close;
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
          const candles = await getFinnhubCandles(activeSymbol, activeInterval, 1);
          if (candles && candles.length > 0) {
            socket.emit('live_candle', candles[candles.length - 1]);
          }
        } catch (error) {
          console.error('Socket polling error:', error.message);
        }
      };

      // Fetch immediately
      await fetchAndEmit();

      // Set up the interval for future updates
      const freq = getPollingFrequency(activeInterval);
      console.log(`Starting updates for ${activeSymbol} every ${freq}ms (${activeInterval})`);
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
