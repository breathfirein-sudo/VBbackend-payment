const { getFinnhubCandles } = require('../services/finnhub');

const getChartData = async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const candles = await getFinnhubCandles(symbol, interval, 200);
    res.json(candles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
};

const getLiveCandle = async (req, res) => {
  try {
    // This will typically be served via socket.io, but the user requested this route
    const { symbol } = req.params;
    const candles = await getFinnhubCandles(symbol, '1m', 1);
    if (candles.length > 0) {
      res.json(candles[candles.length - 1]);
    } else {
      res.status(404).json({ error: 'No live candle found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live candle' });
  }
};

module.exports = {
  getChartData,
  getLiveCandle
};
