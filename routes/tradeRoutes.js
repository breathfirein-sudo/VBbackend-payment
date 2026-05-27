const express = require('express');
const router = express.Router();
const { buyTrade, sellTrade, getTrades } = require('../controllers/tradeController');

router.post('/buy', buyTrade);
router.post('/sell', sellTrade);
router.get('/trades', getTrades);

module.exports = router;
