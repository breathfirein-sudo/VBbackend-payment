const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'testuser@example.com';
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      wallet: true,
      transactions: true,
      payments: true,
      manualDeposits: true
    }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('=== USER DETAILS ===');
  console.log(`Email: ${user.email} | Unlocked: ${user.isUnlocked} | Referral Count: ${user.referralCount}`);
  
  console.log('\n=== WALLET ===');
  console.log(user.wallet);

  console.log('\n=== TRANSACTIONS ===');
  user.transactions.forEach(t => {
    console.log(`ID: ${t.id} | Type: ${t.type} | Asset: ${t.asset} | Amount: ${t.amount} | Details: ${t.details} | Created: ${t.createdAt}`);
  });

  console.log('\n=== PAYMENTS (Razorpay) ===');
  user.payments.forEach(p => {
    console.log(`ID: ${p.id} | OrderId: ${p.orderId} | PaymentId: ${p.paymentId} | Amount: ${p.amount} | Status: ${p.status} | Method: ${p.paymentMethod}`);
  });

  console.log('\n=== MANUAL DEPOSITS ===');
  user.manualDeposits.forEach(d => {
    console.log(`ID: ${d.id} | Amount: ${d.amount} | UTR: ${d.utrNumber} | Status: ${d.status} | Method: ${d.paymentMethod} | Created: ${d.createdAt}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
