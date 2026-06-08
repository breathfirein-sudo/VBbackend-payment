const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'anjalisandeep.pikili@gmail.com';
  
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.error(`User with email ${email} not found.`);
    await prisma.$disconnect();
    return;
  }

  // Delete transactions, payments, and reset wallet balance
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { userId: user.id } }),
    prisma.transaction.deleteMany({ where: { userId: user.id } }),
    prisma.wallet.update({
      where: { userId: user.id },
      data: { balance: 0 }
    })
  ]);

  console.log(`Successfully cleared dummy balance and transactions for user: ${email}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
