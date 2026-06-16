const { getFinnhubCandles } = require('../services/finnhub');
const { getOrStartTracker } = require('../services/livePriceTracker');

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
    const { symbol } = req.params;
    const tracker = await getOrStartTracker(symbol, '1m');
    if (tracker && tracker.lastCandle) {
      res.json(tracker.lastCandle);
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
