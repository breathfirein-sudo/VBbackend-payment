const express = require('express');
const router = express.Router();
const { getChartData, getLiveCandle } = require('../controllers/chartController');

router.get('/chart/:symbol/:interval', getChartData);
router.get('/live/:symbol', getLiveCandle);

module.exports = router;
