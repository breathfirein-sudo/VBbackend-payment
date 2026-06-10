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

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buyTrade = async (req, res) => {
  const { symbol, price, quantity, interval } = req.body;
  const email = req.user.email.toLowerCase();
  try {
    // Check user's withdrawable balance first
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });

    if (!user || !user.wallet) {
      return res.status(400).json({ error: 'User wallet not found' });
    }

    const totalReferralRewards = (user.referralCount || 0) * 10;
    const withdrawableBalance = Math.max(0, user.wallet.balance - totalReferralRewards);

    if (withdrawableBalance < 100) {
      return res.status(400).json({
        error: `Insufficient withdrawable balance. You cannot trade with referral rewards. You need at least ₹100.00 but only have ₹${withdrawableBalance.toFixed(2)}.`
      });
    }

    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms);

    const result = await db.query(
      'INSERT INTO trades (symbol, price, quantity, type, status, expiry_time, user_email) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [symbol, price, quantity, 'BUY', 'OPEN', expiryTime, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error executing buy trade:', error);
    res.status(500).json({ error: 'Failed to execute buy trade' });
  }
};

const sellTrade = async (req, res) => {
  const { symbol, price, quantity, interval } = req.body;
  const email = req.user.email.toLowerCase();
  try {
    // Check user's withdrawable balance first
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });

    if (!user || !user.wallet) {
      return res.status(400).json({ error: 'User wallet not found' });
    }

    const totalReferralRewards = (user.referralCount || 0) * 10;
    const withdrawableBalance = Math.max(0, user.wallet.balance - totalReferralRewards);

    if (withdrawableBalance < 100) {
      return res.status(400).json({
        error: `Insufficient withdrawable balance. You cannot trade with referral rewards. You need at least ₹100.00 but only have ₹${withdrawableBalance.toFixed(2)}.`
      });
    }

    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms);

    const result = await db.query(
      'INSERT INTO trades (symbol, price, quantity, type, status, expiry_time, user_email) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [symbol, price, quantity, 'SELL', 'OPEN', expiryTime, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error executing sell trade:', error);
    res.status(500).json({ error: 'Failed to execute sell trade' });
  }
};

const getTrades = async (req, res) => {
  const email = req.user.email.toLowerCase();
  try {
    const result = await db.query('SELECT * FROM trades WHERE user_email = $1 ORDER BY timestamp DESC LIMIT 100', [email]);
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
