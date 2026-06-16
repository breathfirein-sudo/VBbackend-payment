const { getFinnhubCandles } = require('../services/finnhub');

async function main() {
  try {
    console.log('Fetching latest 5 candles for TSLA...');
    const candles = await getFinnhubCandles('TSLA', '1m', 5);
    console.log('Fetched candles:');
    console.log(candles.map(c => ({
      time: new Date(c.time * 1000).toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.value
    })));
  } catch (error) {
    console.error('Error fetching candles:', error);
  } finally {
    process.exit();
  }
}

main();
