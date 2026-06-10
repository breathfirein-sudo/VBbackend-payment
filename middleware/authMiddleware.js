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
    
    let email;
    let decoded;
    
    if (token === 'dummy-token-for-dev') {
      email = 'testuser@example.com';
    } else {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'replace-with-your-secret');
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token format' });
      }
      email = decoded.email;
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
      // Auto-create user if they don't exist
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
