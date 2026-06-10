require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authController = require('../controllers/authController');

async function testForgot() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('No user found in DB.');
      return;
    }
    
    console.log('Requesting forgot password for user:', user.email);

    let responseData = null;
    const req = {
      body: { email: user.email }
    };
    const res = {
      status: function(code) {
        console.log('HTTP Status Code:', code);
        return this;
      },
      json: function(data) {
        responseData = data;
        return this;
      }
    };

    await authController.forgotPassword(req, res);
    console.log('Response:', responseData);

  } catch (error) {
    console.error('Error in forgot password test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testForgot();
