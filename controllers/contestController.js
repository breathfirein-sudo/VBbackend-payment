const db = require('../db');

const getExpiryMs = (interval) => {
  if (!interval) return 60000; // default 1m
  if (interval.includes('m')) return parseInt(interval) * 60000;
  if (interval.includes('h')) return parseInt(interval) * 3600000;
  if (interval.includes('D')) return parseInt(interval) * 86400000;
  if (interval.includes('W')) return parseInt(interval) * 604800000;
  if (interval.includes('M')) return parseInt(interval) * 2592000000;
  if (interval.includes('R')) return 60000;
  return 60000;
};

// Helper to anonymize email
const anonymizeEmail = (email) => {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name}***@${domain}`;
  }
  return `${name.substring(0, 2)}***${name.substring(name.length - 1)}@${domain}`;
};

// Register user for contest
exports.register = async (req, res) => {
  const email = req.user.email.toLowerCase();
  const name = req.user.name || email.split('@')[0];

  try {
    const { rows: existing } = await db.query(
      'SELECT * FROM contest_participants WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: 'Already registered', participant: existing[0] });
    }

    const { rows: inserted } = await db.query(
      'INSERT INTO contest_participants (email, name, balance) VALUES ($1, $2, 11000.00) RETURNING *',
      [email, name]
    );

    res.status(201).json({ success: true, message: 'Registered successfully', participant: inserted[0] });
  } catch (error) {
    console.error('Error registering for contest:', error);
    res.status(500).json({ success: false, error: 'Registration failed: ' + error.message });
  }
};

// Fetch user's contest profile stats and trades
exports.getProfile = async (req, res) => {
  const email = req.user.email.toLowerCase();

  try {
    const { rows: participant } = await db.query(
      'SELECT * FROM contest_participants WHERE email = $1',
      [email]
    );

    if (participant.length === 0) {
      return res.status(200).json({ success: true, registered: false });
    }

    const { rows: trades } = await db.query(
      'SELECT * FROM contest_trades WHERE user_email = $1 ORDER BY timestamp DESC LIMIT 50',
      [email]
    );

    res.status(200).json({
      success: true,
      registered: true,
      profile: participant[0],
      trades: trades
    });
  } catch (error) {
    console.error('Error fetching contest profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contest profile' });
  }
};

// Fetch user's contest trades
exports.getTrades = async (req, res) => {
  const email = req.user.email.toLowerCase();
  try {
    const { rows } = await db.query(
      'SELECT * FROM contest_trades WHERE user_email = $1 ORDER BY timestamp DESC',
      [email]
    );
    res.status(200).json({ success: true, trades: rows });
  } catch (error) {
    console.error('Error fetching contest trades:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contest trades' });
  }
};

// Place contest trade
exports.placeTrade = async (req, res) => {
  const email = req.user.email.toLowerCase();
  const { symbol, price, type, entryAmount, interval } = req.body;

  if (!symbol || !price || !type || !entryAmount || !interval) {
    return res.status(400).json({ success: false, error: 'Missing trade parameters' });
  }

  const amt = parseFloat(entryAmount);
  if (isNaN(amt) || amt !== 100) {
    return res.status(400).json({ success: false, error: 'Trade amount must be exactly 100 rupees' });
  }

  const riskAmount = 11;
  const adminFee = 1;

  try {
    // 1. Get participant to verify balance
    const { rows: participant } = await db.query(
      'SELECT * FROM contest_participants WHERE email = $1',
      [email]
    );

    if (participant.length === 0) {
      return res.status(400).json({ success: false, error: 'User is not registered for the contest' });
    }

    const currentBalance = parseFloat(participant[0].balance);
    if (currentBalance < riskAmount) {
      return res.status(400).json({ success: false, error: 'Insufficient contest wallet balance' });
    }

    // 2. Calculate quantity and expiry time
    const quantity = amt / parseFloat(price);
    const ms = getExpiryMs(interval);
    const expiryTime = new Date(Date.now() + ms).toISOString();

    // 3. Deduct balance in transaction
    await db.query('BEGIN');

    // Deduct 11 from the user's contest balance
    await db.query(
      'UPDATE contest_participants SET balance = balance - $1 WHERE email = $2',
      [riskAmount, email]
    );

    // Add 1 to the superadmin's main Wallet
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.user.update({
      where: { email: 'sandeepkumar.pikili@vrpigroup.co.in' },
      data: {
        wallet: {
          update: {
            balance: { increment: adminFee }
          }
        }
      }
    });

    const { rows: inserted } = await db.query(
      `INSERT INTO contest_trades (user_email, symbol, price, quantity, type, status, entry_amount, expiry_time) 
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7) RETURNING *`,
      [email, symbol, price, quantity, type.toUpperCase(), amt, expiryTime]
    );

    await db.query('COMMIT');

    res.status(201).json({ success: true, message: 'Contest trade placed successfully', trade: inserted[0] });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error placing contest trade:', error);
    res.status(500).json({ success: false, error: 'Trade execution failed: ' + error.message });
  }
};

// Fetch leaderboard (public access permitted but token verified for user relevance)
exports.getLeaderboard = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT name, email, balance, total_trades, profit_trades, loss_trades, success_rate 
       FROM contest_participants 
       WHERE email NOT LIKE '%@vbcontest.com'
       ORDER BY success_rate DESC, total_trades DESC, balance DESC 
       LIMIT 100`
    );

    // Anonymize emails for privacy
    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      email: anonymizeEmail(row.email),
      totalTrades: row.total_trades,
      profitTrades: row.profit_trades,
      lossTrades: row.loss_trades,
      successRate: parseFloat(row.success_rate),
      balance: parseFloat(row.balance)
    }));

    res.status(200).json({ success: true, leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve leaderboard data' });
  }
};

// --- Super Admin Panel Operations ---

// Get all participants (Admin only)
exports.adminGetParticipants = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM contest_participants ORDER BY total_trades DESC, success_rate DESC'
    );
    res.status(200).json({ success: true, participants: rows });
  } catch (error) {
    console.error('Admin get participants error:', error);
    res.status(500).json({ success: false, error: 'Admin query failed' });
  }
};

// Update participant stats/balance (Admin only)
exports.adminUpdateParticipant = async (req, res) => {
  const { email, balance, totalTrades, profitTrades, lossTrades, successRate } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Participant email required' });
  }

  try {
    await db.query(
      `UPDATE contest_participants 
       SET balance = $1, total_trades = $2, profit_trades = $3, loss_trades = $4, success_rate = $5 
       WHERE email = $6`,
      [
        parseFloat(balance),
        parseInt(totalTrades),
        parseInt(profitTrades),
        parseInt(lossTrades),
        parseFloat(successRate),
        email.toLowerCase()
      ]
    );

    res.status(200).json({ success: true, message: 'Participant record updated successfully' });
  } catch (error) {
    console.error('Admin update participant error:', error);
    res.status(500).json({ success: false, error: 'Update override failed' });
  }
};

// Reset participant's contest progress (Admin only)
exports.adminResetParticipant = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Participant email required' });
  }

  try {
    await db.query('BEGIN');
    
    // Delete trades
    await db.query('DELETE FROM contest_trades WHERE user_email = $1', [email.toLowerCase()]);
    
    // Reset stats
    await db.query(
      `UPDATE contest_participants 
       SET balance = 11000.00, total_trades = 0, profit_trades = 0, loss_trades = 0, success_rate = 0.00 
       WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    await db.query('COMMIT');
    res.status(200).json({ success: true, message: 'Participant progress reset successfully' });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Admin reset participant error:', error);
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
};

// Generate Mock Participants for Demonstration (Admin only)
exports.adminGenerateMock = async (req, res) => {
  const mockTraders = [
    { name: 'Rohan Sharma', email: 'rohan.sharma@vbcontest.com', total: 367, wins: 301, balance: 45000.00 },
    { name: 'Ananya Iyer', email: 'ananya.iyer@vbcontest.com', total: 382, wins: 285, balance: 31200.50 },
    { name: 'Kabir Mehta', email: 'kabir.mehta@vbcontest.com', total: 365, wins: 256, balance: 22400.00 },
    { name: 'Vikram Malhotra', email: 'vikram.mal@vbcontest.com', total: 290, wins: 220, balance: 19100.00 },
    { name: 'Pooja Patel', email: 'pooja.patel@vbcontest.com', total: 370, wins: 224, balance: 17200.00 },
    { name: 'Devendra Singh', email: 'dev.singh@vbcontest.com', total: 110, wins: 78, balance: 12500.00 },
    { name: 'Simran Kaur', email: 'simran.k@vbcontest.com', total: 366, wins: 212, balance: 11800.00 },
    { name: 'Aarav Gupta', email: 'aarav.g@vbcontest.com', total: 45, wins: 32, balance: 10400.00 },
    { name: 'Neha Reddy', email: 'neha.reddy@vbcontest.com', total: 365, wins: 180, balance: 8200.00 },
    { name: 'Rahul Verma', email: 'rahul.v@vbcontest.com', total: 12, wins: 5, balance: 9500.00 }
  ];

  try {
    await db.query('BEGIN');
    
    // Clear previous mock traders to prevent bloating
    await db.query("DELETE FROM contest_participants WHERE email LIKE '%@vbcontest.com'");

    for (let trader of mockTraders) {
      const rate = ((trader.wins / trader.total) * 100).toFixed(2);
      const losses = trader.total - trader.wins;
      
      // Insert participant
      await db.query(
        `INSERT INTO contest_participants (email, name, balance, total_trades, profit_trades, loss_trades, success_rate) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [trader.email, trader.name, trader.balance, trader.total, trader.wins, losses, rate]
      );

      // Insert 1 open trade and 2 closed mock trades for detail page representation
      await db.query(
        `INSERT INTO contest_trades (user_email, symbol, price, quantity, type, status, entry_amount, expiry_time, close_price, pnl) 
         VALUES ($1, 'TSLA', 180.25, 5, 'BUY', 'WON', 901.25, NOW() - INTERVAL '1 hour', 195.40, 721.00)`,
        [trader.email]
      );
      
      await db.query(
        `INSERT INTO contest_trades (user_email, symbol, price, quantity, type, status, entry_amount, expiry_time, close_price, pnl) 
         VALUES ($1, 'AAPL', 170.50, 4, 'SELL', 'LOST', 682.00, NOW() - INTERVAL '30 minutes', 175.20, -682.00)`,
        [trader.email]
      );
      
      await db.query(
        `INSERT INTO contest_trades (user_email, symbol, price, quantity, type, status, entry_amount, expiry_time) 
         VALUES ($1, 'NVDA', 920.10, 1, 'BUY', 'OPEN', 920.10, NOW() + INTERVAL '10 minutes')`,
        [trader.email]
      );
    }

    await db.query('COMMIT');
    res.status(200).json({ success: true, message: 'Mock participants populated successfully' });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error seeding mock contest participants:', error);
    res.status(500).json({ success: false, error: 'Mock seeding failed: ' + error.message });
  }
};

// Get trades for a specific participant (Admin only)
exports.adminGetParticipantTrades = async (req, res) => {
  const { email } = req.params;
  try {
    const { rows } = await db.query(
      'SELECT * FROM contest_trades WHERE user_email = $1 ORDER BY timestamp DESC',
      [email.toLowerCase()]
    );
    res.status(200).json({ success: true, trades: rows });
  } catch (error) {
    console.error('Admin get trades error:', error);
    res.status(500).json({ success: false, error: 'Admin query failed: ' + error.message });
  }
};

