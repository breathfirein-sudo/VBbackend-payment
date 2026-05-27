const db = require('../db');

const getExpiryMs = (interval) => {
  if (!interval) return 60000; // default 1m
  if (interval.includes('m')) return parseInt(interval) * 60000;
  if (interval.includes('h')) return parseInt(interval) * 3600000;
  if (interval.includes('D')) return parseInt(interval) * 86400000;
  if (interval.includes('W')) return parseInt(interval) * 604800000;
  if (interval.includes('M')) return parseInt(interval) * 2592000000;
  if (interval.includes('R')) return 60000; // fallback to 1m for ranges
  return 60000;
};

const buyTrade = async (req, res) => {
  const { symbol, price, quantity, interval } = req.body;
  try {
    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms);

    const result = await db.query(
      'INSERT INTO trades (symbol, price, quantity, type, status, expiry_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [symbol, price, quantity, 'BUY', 'OPEN', expiryTime]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error executing buy trade:', error);
    res.status(500).json({ error: 'Failed to execute buy trade' });
  }
};

const sellTrade = async (req, res) => {
  const { symbol, price, quantity, interval } = req.body;
  try {
    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms);

    const result = await db.query(
      'INSERT INTO trades (symbol, price, quantity, type, status, expiry_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [symbol, price, quantity, 'SELL', 'OPEN', expiryTime]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error executing sell trade:', error);
    res.status(500).json({ error: 'Failed to execute sell trade' });
  }
};

const getTrades = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
};

module.exports = {
  buyTrade,
  sellTrade,
  getTrades
};
