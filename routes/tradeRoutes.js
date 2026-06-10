const express = require('express');
const router = express.Router();
const { buyTrade, sellTrade, getTrades } = require('../controllers/tradeController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/buy', requireAuth, buyTrade);
router.post('/sell', requireAuth, sellTrade);
router.get('/trades', requireAuth, getTrades);

module.exports = router;
