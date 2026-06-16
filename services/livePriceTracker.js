const { getFinnhubCandles } = require('./finnhub');

// Keep track of active symbols and their simulated prices
const trackers = {};

// Helper to get rounded time based on interval
const getIntervalSeconds = (intv) => {
  if (!intv) return 60;
  if (intv.includes('m')) return parseInt(intv) * 60;
  if (intv.includes('h')) return parseInt(intv) * 3600;
  if (intv.includes('D') || intv.includes('d')) return 86400;
  if (intv.includes('W') || intv.includes('w')) return 7 * 86400;
  if (intv.includes('M') || intv.includes('mo')) return 30 * 86400;
  return 60;
};

// Initialize or update tracking for a symbol
const getOrStartTracker = async (symbol, interval = '1m') => {
  const key = `${symbol}_${interval}`;
  if (trackers[key]) {
    trackers[key].lastRequestedTime = Date.now();
    return trackers[key];
  }

  console.log(`[PriceTracker] Initializing tracker for ${symbol} (${interval})`);
  
  trackers[key] = {
    symbol,
    interval,
    currentPrice: null,
    lastCandle: null,
    lastFetchTime: 0,
    lastRequestedTime: Date.now(),
    isFetching: false
  };

  await refreshBasePrice(symbol, interval);
  return trackers[key];
};

const refreshBasePrice = async (symbol, interval) => {
  const key = `${symbol}_${interval}`;
  const tracker = trackers[key];
  if (!tracker || tracker.isFetching) return;

  tracker.isFetching = true;
  try {
    // Fetch a few candles to get the latest base price
    const candles = await getFinnhubCandles(symbol, interval, 5);
    if (candles && candles.length > 0) {
      const latest = candles[candles.length - 1];
      tracker.lastFetchTime = Date.now();
      
      if (!tracker.currentPrice) {
        tracker.currentPrice = latest.close;
        tracker.lastCandle = { ...latest };
      } else {
        // Keep it aligned with the real price. If drift is > 2%, snap it.
        const diff = Math.abs(tracker.currentPrice - latest.close) / latest.close;
        if (diff > 0.02) {
          tracker.currentPrice = latest.close;
        }
        
        const intervalSec = getIntervalSeconds(interval);
        const nowSec = Math.floor(Date.now() / 1000);
        const roundedTime = Math.floor(nowSec / intervalSec) * intervalSec;
        
        if (tracker.lastCandle && tracker.lastCandle.time === roundedTime) {
          tracker.lastCandle.high = Math.max(tracker.lastCandle.high, latest.high, tracker.currentPrice);
          tracker.lastCandle.low = Math.min(tracker.lastCandle.low, latest.low, tracker.currentPrice);
        } else {
          tracker.lastCandle = {
            time: roundedTime,
            open: tracker.currentPrice,
            high: tracker.currentPrice,
            low: tracker.currentPrice,
            close: tracker.currentPrice,
            value: latest.value || 0
          };
        }
      }
    }
  } catch (error) {
    console.error(`[PriceTracker] Error refreshing base price for ${symbol}:`, error.message);
  } finally {
    tracker.isFetching = false;
  }
};

// Generate live ticks every 1 second for active trackers
setInterval(async () => {
  const now = Date.now();
  for (const key in trackers) {
    const tracker = trackers[key];
    
    // Stop tracking if inactive for over 2 minutes
    if (now - tracker.lastRequestedTime > 120000) {
      console.log(`[PriceTracker] Stopping tracker for ${key} due to inactivity`);
      delete trackers[key];
      continue;
    }

    // Refresh base price from Yahoo Finance every 30 seconds
    if (now - tracker.lastFetchTime > 30000) {
      refreshBasePrice(tracker.symbol, tracker.interval);
    }

    if (tracker.currentPrice !== null) {
      // Simulate minor price fluctuation: random walk (within +/- 0.015%)
      const changePercent = (Math.random() - 0.5) * 0.0003; 
      tracker.currentPrice = parseFloat((tracker.currentPrice * (1 + changePercent)).toFixed(4));
      
      const intervalSec = getIntervalSeconds(tracker.interval);
      const nowSec = Math.floor(now / 1000);
      const roundedTime = Math.floor(nowSec / intervalSec) * intervalSec;

      if (!tracker.lastCandle || roundedTime > tracker.lastCandle.time) {
        const prevClose = tracker.lastCandle ? tracker.lastCandle.close : tracker.currentPrice;
        tracker.lastCandle = {
          time: roundedTime,
          open: prevClose,
          high: Math.max(prevClose, tracker.currentPrice),
          low: Math.min(prevClose, tracker.currentPrice),
          close: tracker.currentPrice,
          value: 0
        };
      } else {
        tracker.lastCandle.close = tracker.currentPrice;
        tracker.lastCandle.high = Math.max(tracker.lastCandle.high, tracker.currentPrice);
        tracker.lastCandle.low = Math.min(tracker.lastCandle.low, tracker.currentPrice);
      }
    }
  }
}, 1000);

const getCurrentPrice = async (symbol, interval = '1m') => {
  const key = `${symbol}_${interval}`;
  let tracker = trackers[key];
  if (!tracker) {
    tracker = await getOrStartTracker(symbol, interval);
  }
  return tracker.currentPrice;
};

module.exports = {
  getOrStartTracker,
  getCurrentPrice,
  trackers
};
