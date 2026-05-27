const { getFinnhubCandles } = require('../services/finnhub');
const db = require('../db');

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
