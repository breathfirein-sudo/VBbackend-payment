const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/authMiddleware');

// Protect all payment routes with authentication middleware
router.use(requireAuth);

router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPayment);
router.get('/', paymentController.getPaymentHistory);
router.get('/:id', paymentController.getPaymentDetails);

module.exports = router;
