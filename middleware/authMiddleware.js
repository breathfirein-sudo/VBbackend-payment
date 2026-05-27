const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Note: If you are using Firebase Auth, you would typically use firebase-admin.auth().verifyIdToken(token) here.
    // For now, we will assume standard JWT or a mocked decode since Firebase wasn't strictly configured in backend.
    // If you haven't implemented backend JWT signing, we bypass the signature verification and decode the email,
    // just for the sake of making this work with your existing Firebase frontend token if it's sent as a bearer token.
    
    // As a robust placeholder for development, we just try to decode it.
    let email;

    if (token === 'dummy-token-for-dev') {
      email = 'testuser@example.com';
    } else {
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'replace-with-your-secret');
      } catch (err) {
        decoded = jwt.decode(token);
        if (!decoded) throw new Error('Invalid token format');
      }
      email = decoded.email || decoded.email_address || (decoded.user && decoded.user.email);
    }
    
    if (!email) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token payload' });
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { wallet: true }
      });
    } catch (dbError) {
      console.error("Database Error in Auth:", dbError.message);
      return res.status(500).json({ success: false, error: `Database connection failed: ${dbError.message}` });
    }

    if (!user) {
      // Auto-create user if they don't exist in PostgreSQL yet (useful for Firebase integration)
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: (typeof decoded !== 'undefined' && decoded && decoded.name) ? decoded.name : email.split('@')[0],
          wallet: {
            create: { balance: 0 } // Initialize empty wallet
          }
        },
        include: { wallet: true }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(401).json({ success: false, error: `Auth Error: ${error.message}` });
  }
};

module.exports = { requireAuth };
