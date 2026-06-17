const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'sandeepkumar.pikili@gmail.com' }
  });

  if (!user) {
    console.error("Target user sandeepkumar.pikili@gmail.com not found!");
    process.exit(1);
  }

  // Ensure the target user has a phone number set in DB
  await prisma.user.update({
    where: { id: user.id },
    data: { phone: '+918095123456' }
  });

  const amount = 2500.00;
  const orderId = `pout_sim_${Date.now()}`;
  
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      orderId: orderId,
      amount: amount,
      currency: 'INR',
      status: 'processing',
      paymentMethod: 'bank_withdrawal_sim',
      bankAccount: '918010023456789',
      ifsc: 'UTIB0000004',
      bankName: 'Axis Bank',
      accountHolder: 'Sandeep Kumar Pikili',
      upiId: 'RTGS', // Store 'RTGS' as payout mode
      availableBalanceAfter: 5000.00
    }
  });

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      type: 'withdrawal',
      asset: 'wallet',
      amount: amount,
      details: `Simulated withdrawal (RTGS) to 918010023456789 (Payout ID: ${orderId})`
    }
  });

  console.log("Successfully created dummy withdrawal sample:");
  console.log("Payment Record:", payment);
  console.log("Transaction Record:", transaction);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error creating dummy withdrawal:", err);
  prisma.$disconnect();
});
