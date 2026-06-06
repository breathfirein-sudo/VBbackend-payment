const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/validate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ valid: false });
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      res.json({ valid: true, referralCount: user.referralCount });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

router.post('/kyc/upload', async (req, res) => {
  try {
    const { email, kycDocument, kycDocName, kycDocType, kycUploadedAt } = req.body;
    if (!email || !kycDocument) {
      return res.status(400).json({ success: false, error: 'Email and document data are required' });
    }
    
    await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: {
        kycStatus: 'Submitted',
        kycDocument,
        kycDocName,
        kycDocType,
        kycUploadedAt
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
