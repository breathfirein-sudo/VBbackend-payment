const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const getIntervalString = (frontendInterval) => {
  // Yahoo Finance intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
  if (frontendInterval.includes('m')) {
    const min = parseInt(frontendInterval);
    if (min <= 1) return '1m';
    if (min <= 2) return '2m';
    if (min <= 5) return '5m';
    if (min <= 15) return '15m';
    if (min <= 30) return '30m';
    return '60m';
  }
  if (frontendInterval.includes('h')) return '1h';
  if (frontendInterval.includes('D')) return '1d';
  if (frontendInterval.includes('W')) return '1wk';
  if (frontendInterval.includes('M')) return '1mo';
  return '1m';
};

const getIntervalSeconds = (intv) => {
  if (!intv) return 60;
  if (intv.includes('m')) return parseInt(intv) * 60;
  if (intv.includes('h')) return parseInt(intv) * 3600;
  if (intv.includes('D') || intv.includes('d')) return 86400;
  if (intv.includes('W') || intv.includes('w')) return 7 * 86400;
  if (intv.includes('M') || intv.includes('mo')) return 30 * 86400;
  return 60;
};

const getFinnhubCandles = async (symbol, interval, count = 100) => {
  try {
    let yahooSymbol = symbol;
    // Map 6-character forex pairs (e.g. GBPUSD) to Yahoo format (GBPUSD=X)
    if (/^[A-Za-z]{6}$/.test(symbol)) {
      yahooSymbol = `${symbol.toUpperCase()}=X`;
    }

    const period = getIntervalString(interval);
    
    // Yahoo uses actual date objects or timestamps
    const to = new Date();
    
    // Calculate a safe 'from' date based on interval and count
    let lookbackDays = 7; // Default to 7 days to cover long weekends/holidays
    
    if (period === '1d') lookbackDays = count * 2; // e.g. 200 days -> 400 days
    else if (period === '1wk') lookbackDays = count * 10;
    else if (period === '1mo') lookbackDays = count * 40;
    else if (period.includes('h')) lookbackDays = count / 2; // e.g. 200 hours -> 100 days
 
    // Ensure we don't exceed Yahoo's 7-day limit for 1m intervals
    if (period === '1m') lookbackDays = 7;
 
    const from = new Date(to.getTime() - (lookbackDays * 86400 * 1000)); 
 
    const queryOptions = { period1: from, period2: to, interval: period };
    const result = await yahooFinance.chart(yahooSymbol, queryOptions);
    
    if (result && result.quotes && result.quotes.length > 0) {
      const intervalSec = getIntervalSeconds(interval);
      const candles = [];
      for (const quote of result.quotes) {
        if (quote.open !== null && quote.close !== null) {
          const rawTime = Math.floor(quote.date.getTime() / 1000);
          const roundedTime = Math.floor(rawTime / intervalSec) * intervalSec;
          candles.push({
            time: roundedTime,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            value: quote.volume || 0
          });
        }
      }
      
      // Return only the requested count to avoid overflowing the chart
      return candles.slice(-count);
    } else {
      return [];
    }
  } catch (error) {
    console.error(`Error fetching ${yahooSymbol} (${interval}) from Yahoo Finance:`, error.message);
    return [];
  }
};

module.exports = {
  getFinnhubCandles
};
