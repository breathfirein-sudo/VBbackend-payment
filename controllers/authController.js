const nodemailer = require('nodemailer');

// In-memory store for OTPs as a fallback
const otpStore = new Map();

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

exports.sendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store OTP in memory (valid for 5 minutes)
  otpStore.set(email, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  try {
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your VB Commodities OTP Verification Code',
      text: `Your verification code is: ${otp}. It will expire in 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>VB Exchange</h2>
          <p>Your verification code is: <strong>${otp}</strong></p>
          <p>This code will expire in 5 minutes.</p>
        </div>
      `,
    };

    if (process.env.GMAIL_USER && process.env.GMAIL_USER !== 'YOUR_GMAIL') {
      try {
        await transporter.sendMail(mailOptions);
        console.log(`[SMTP] Successfully dispatched OTP to ${email}`);
      } catch (smtpError) {
        console.error('[SMTP Error] Failed to send email via Gmail:', smtpError.message);
        // Fallback to MOCK OTP so the app doesn't break locally if SMTP fails
        console.log(`[MOCK OTP FALLBACK] Email: ${email}, OTP: ${otp}`);
        return res.status(200).json({ 
          success: true,
          deliveryType: 'console_fallback',
          redisType: 'memory',
          message: `SMTP Error: ${smtpError.message}. Check your backend console for the fallback OTP.` 
        });
      }
    } else {
      console.log(`[MOCK OTP] Email: ${email}, OTP: ${otp}`);
    }

    res.status(200).json({
      success: true,
      deliveryType: 'email',
      redisType: 'memory',
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ success: false, error: 'Failed to send OTP: ' + error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const record = otpStore.get(email);

  if (!record) {
    return res.status(400).json({ success: false, error: 'No OTP found for this email or OTP expired' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ success: false, error: 'OTP has expired' });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ success: false, error: 'Invalid OTP code' });
  }

  // Clear OTP after successful verification
  otpStore.delete(email);

  res.status(200).json({ success: true, message: 'OTP verified successfully' });
};
