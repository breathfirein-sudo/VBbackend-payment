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
  const { symbol, price, investmentAmount, interval } = req.body;
  const email = req.user.email.toLowerCase();
  
  const amt = parseFloat(investmentAmount);
  if (isNaN(amt) || amt !== 100) {
    return res.status(400).json({ error: 'Investment amount is fixed at ₹100.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });

    if (!user || !user.wallet) {
      return res.status(400).json({ error: 'User wallet not found' });
    }

    if (user.wallet.balance < amt) {
      return res.status(400).json({
        error: `Insufficient wallet balance. Placing a trade requires ₹${amt.toFixed(2)} but you only have ₹${user.wallet.balance.toFixed(2)}.`
      });
    }

    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms).toISOString();
    const tradeStake = amt * 0.10;
    const appFee = amt * 0.01;
    const qty = tradeStake / parseFloat(price);
    const balanceBefore = parseFloat(user.wallet.balance);

    await db.query('BEGIN');
    try {
      // 1. Deduct exactly investmentAmount from user's Wallet balance
      await db.query(
        'UPDATE "Wallet" SET balance = balance - $1 WHERE "userId" = $2',
        [amt, user.id]
      );

      // 2. Insert standard trade with details including wallet_balance_before
      const result = await db.query(
        `INSERT INTO trades (
          symbol, price, quantity, type, status, expiry_time, user_email, 
          investment_amount, pnl, trade_stake, application_fee, returned_amount, profit_loss_amount, user_id,
          wallet_balance_before, wallet_balance_after
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, 0.00, 0.00, $11, $12, 0.00) RETURNING *`,
        [symbol, price, qty, 'BUY', 'OPEN', expiryTime, email, amt, tradeStake, appFee, user.id, balanceBefore]
      );

      // 3. Record wallet transaction log
      await db.query(
        `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
         VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
        [user.id, 'TRADE_PLACE', symbol, -amt, appFee, `Standard Paper Trade BUY placement of ${symbol}`]
      );

      await db.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (txErr) {
      await db.query('ROLLBACK');
      throw txErr;
    }
  } catch (error) {
    console.error('Error executing buy trade:', error);
    res.status(500).json({ error: 'Failed to execute buy trade' });
  }
};

const sellTrade = async (req, res) => {
  const { symbol, price, investmentAmount, interval } = req.body;
  const email = req.user.email.toLowerCase();
  
  const amt = parseFloat(investmentAmount);
  if (isNaN(amt) || amt !== 100) {
    return res.status(400).json({ error: 'Investment amount is fixed at ₹100.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });

    if (!user || !user.wallet) {
      return res.status(400).json({ error: 'User wallet not found' });
    }

    if (user.wallet.balance < amt) {
      return res.status(400).json({
        error: `Insufficient wallet balance. Placing a trade requires ₹${amt.toFixed(2)} but you only have ₹${user.wallet.balance.toFixed(2)}.`
      });
    }

    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms).toISOString();
    const tradeStake = amt * 0.10;
    const appFee = amt * 0.01;
    const qty = tradeStake / parseFloat(price);
    const balanceBefore = parseFloat(user.wallet.balance);

    await db.query('BEGIN');
    try {
      // 1. Deduct exactly investmentAmount from user's Wallet balance
      await db.query(
        'UPDATE "Wallet" SET balance = balance - $1 WHERE "userId" = $2',
        [amt, user.id]
      );

      // 2. Insert standard trade with details including wallet_balance_before
      const result = await db.query(
        `INSERT INTO trades (
          symbol, price, quantity, type, status, expiry_time, user_email, 
          investment_amount, pnl, trade_stake, application_fee, returned_amount, profit_loss_amount, user_id,
          wallet_balance_before, wallet_balance_after
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, 0.00, 0.00, $11, $12, 0.00) RETURNING *`,
        [symbol, price, qty, 'SELL', 'OPEN', expiryTime, email, amt, tradeStake, appFee, user.id, balanceBefore]
      );

      // 3. Record wallet transaction log
      await db.query(
        `INSERT INTO "Transaction" ("userId", "type", "asset", "amount", "fee", "gst", "details", "createdAt") 
         VALUES ($1, $2, $3, $4, $5, 0.00, $6, CURRENT_TIMESTAMP)`,
        [user.id, 'TRADE_PLACE', symbol, -amt, appFee, `Standard Paper Trade SELL placement of ${symbol}`]
      );

      await db.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (txErr) {
      await db.query('ROLLBACK');
      throw txErr;
    }
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
