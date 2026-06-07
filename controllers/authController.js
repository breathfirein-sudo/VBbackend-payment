const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'replace-with-your-secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// In-memory store for OTPs (registration) and reset tokens
const otpStore = new Map();
const resetTokenStore = new Map(); // token -> { email, expiresAt }

// Configure Nodemailer transporter
const transporter = process.env.RESEND_API_KEY 
  ? nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    })
  : nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

const getFromEmail = () => process.env.RESEND_API_KEY ? (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev') : process.env.GMAIL_USER;

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
      from: getFromEmail(),
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

    if (process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_USER !== 'YOUR_GMAIL')) {
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

exports.register = async (req, res) => {
  const { email, password, name, referralCode, defaultReferralCode } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email is already registered' });
    }

    if (!referralCode) {
      return res.status(400).json({ success: false, error: 'A valid referral code is required to create an account' });
    }

    let referrer = null;
    const refUpper = referralCode.toUpperCase();

    if (refUpper === 'INVEST-WELCOME') {
      // Super Admin referral
      referrer = await prisma.user.findFirst({
        where: { email: 'sandeepkumar.pikili@vrpigroup.co.in' }
      });
    } else if (refUpper.startsWith('IH-')) {
      const codeWithoutPrefix = refUpper.replace('IH-', '').toLowerCase();
      // Use a targeted DB query instead of loading all users
      const allUsers = await prisma.user.findMany({
        where: {
          email: {
            startsWith: codeWithoutPrefix + '@',
            mode: 'insensitive'
          }
        },
        take: 1
      });
      referrer = allUsers[0] || null;
    }

    if (!referrer) {
      return res.status(400).json({ success: false, error: 'Invalid referral code' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        password: hashedPassword,
        wallet: {
          create: { balance: 0 } // start with 0 balance
        }
      }
    });

    // Credit referrer

      if (referrer) {
        let referrerWallet = await prisma.wallet.findUnique({
          where: { userId: referrer.id }
        });

        if (!referrerWallet) {
          await prisma.wallet.create({
            data: {
              userId: referrer.id,
              balance: 100010 // default 100,000 + 10 bonus
            }
          });
        } else {
          await prisma.wallet.update({
            where: { userId: referrer.id },
            data: { balance: { increment: 10 } }
          });
        }
        
        await prisma.user.update({
          where: { id: referrer.id },
          data: { referralCount: { increment: 1 } }
        });
      }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Support both bcrypt hash check and plaintext fallback (e.g. for existing sandeep admin account)
    let isPasswordValid = false;
    if (user.password) {
      if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
        isPasswordValid = await bcrypt.compare(password, user.password);
      } else {
        // Plaintext comparison fallback
        isPasswordValid = user.password === password;
      }
    }

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Email is not registered' });
    }

    // Generate a secure random token (valid for 30 minutes)
    const token = crypto.randomBytes(32).toString('hex');
    resetTokenStore.set(token, {
      email: email.toLowerCase(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: getFromEmail(),
      to: email,
      subject: 'Reset Your VB Commodities Password',
      text: `Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 30 minutes. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #0f1117; color: #e2e8f0; border-radius: 12px;">
          <h2 style="color: #f0b429; margin-bottom: 8px;">VB Exchange</h2>
          <h3 style="margin-top: 0; color: #ffffff;">Password Reset Request</h3>
          <p style="color: #94a3b8;">You requested a password reset for your account. Click the button below to set a new password:</p>
          <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: linear-gradient(135deg, #f0b429, #e09400); color: #000; font-weight: 700; border-radius: 8px; text-decoration: none; font-size: 15px;">Reset My Password</a>
          <p style="color: #64748b; font-size: 13px;">This link will expire in <strong style="color: #94a3b8;">30 minutes</strong>. If you did not request a password reset, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
          <p style="color: #475569; font-size: 12px;">If the button above doesn't work, paste this URL into your browser:<br/><span style="color: #94a3b8; word-break: break-all;">${resetLink}</span></p>
        </div>
      `,
    };

    if (process.env.RESEND_API_KEY || (process.env.GMAIL_USER && process.env.GMAIL_USER !== 'YOUR_GMAIL')) {
      try {
        await transporter.sendMail(mailOptions);
        console.log(`[SMTP] Password Reset Link sent to ${email}`);
      } catch (smtpError) {
        console.error('[SMTP Error] Password Reset Link Gmail failed:', smtpError.message);
        console.log(`[MOCK RESET LINK FALLBACK] Email: ${email}, Link: ${resetLink}`);
        return res.status(200).json({
          success: true,
          deliveryType: 'console_fallback',
          message: 'Check your backend console for the mock password reset link.'
        });
      }
    } else {
      console.log(`[MOCK RESET LINK] Email: ${email}, Link: ${resetLink}`);
    }

    res.status(200).json({
      success: true,
      deliveryType: 'email',
      message: 'Password reset link sent to your email'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to request password reset: ' + error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Token and new password are required' });
  }

  try {
    const record = resetTokenStore.get(token);
    if (!record) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    if (Date.now() > record.expiresAt) {
      resetTokenStore.delete(token);
      return res.status(400).json({ success: false, error: 'Reset link has expired. Please request a new one.' });
    }

    // Clear token
    resetTokenStore.delete(token);

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email: record.email },
      data: { password: hashedPassword }
    });

    console.log(`[Reset Password] Successfully reset password for ${record.email}`);
    res.status(200).json({ success: true, message: 'Password has been reset successfully', email: record.email });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password: ' + error.message });
  }
};

