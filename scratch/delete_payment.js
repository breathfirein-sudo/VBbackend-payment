require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndDelete() {
  try {
    const orderId = 'pout_sim_1780907622602_9039';
    
    // Find the payment record
    const payment = await prisma.payment.findUnique({
      where: { orderId: orderId },
      include: { user: true }
    });

    if (!payment) {
      console.log('No payment record found with orderId:', orderId);
      
      // Let's search by user email as well just in case
      console.log('Searching for payments from user anjalisandeep.pikili@gmail.com...');
      const user = await prisma.user.findUnique({
        where: { email: 'anjalisandeep.pikili@gmail.com' }
      });
      if (user) {
        const userPayments = await prisma.payment.findMany({
          where: { userId: user.id }
        });
        console.log(`Found ${userPayments.length} payments for this user:`, userPayments);
      } else {
        console.log('User not found.');
      }
      return;
    }

    console.log('Found Payment Record:', {
      id: payment.id,
      userId: payment.userId,
      email: payment.user?.email,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      createdAt: payment.createdAt
    });

    // Delete the record
    const deleted = await prisma.payment.delete({
      where: { id: payment.id }
    });
    console.log('Successfully deleted payment record:', deleted);

  } catch (error) {
    console.error('Error querying/deleting record:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndDelete();
