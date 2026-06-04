const express = require('express');
const router = express.Router();
const contestController = require('../controllers/contestController');
const { requireAuth } = require('../middleware/authMiddleware');

// Require authentication for all contest routes
router.use(requireAuth);

router.post('/register', contestController.register);
router.get('/profile', contestController.getProfile);
router.get('/trades', contestController.getTrades);
router.post('/trade', contestController.placeTrade);
router.get('/leaderboard', contestController.getLeaderboard);

// Admin helper middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.email.toLowerCase() === 'sandeepkumar.pikili@vrpigroup.co.in') {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Forbidden: Super Admin access required' });
};

// Admin endpoints
router.get('/admin/participants', requireAdmin, contestController.adminGetParticipants);
router.post('/admin/update-participant', requireAdmin, contestController.adminUpdateParticipant);
router.post('/admin/reset-participant', requireAdmin, contestController.adminResetParticipant);
router.post('/admin/generate-mock', requireAdmin, contestController.adminGenerateMock);
router.get('/admin/trades/:email', requireAdmin, contestController.adminGetParticipantTrades);

module.exports = router;
