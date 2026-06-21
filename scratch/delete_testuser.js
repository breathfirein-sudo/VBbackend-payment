const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'testuser@example.com';
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    console.log('Test user not found.');
    return;
  }

  const id = user.id;
  console.log(`Deleting user: ${user.email} (ID: ${id})`);

  await prisma.manualDeposit.deleteMany({ where: { userId: id } });
  await prisma.payment.deleteMany({ where: { userId: id } });
  await prisma.transaction.deleteMany({ where: { userId: id } });
  await prisma.position.deleteMany({ where: { userId: id } });
  await prisma.trade.deleteMany({ where: { userId: id } });
  await prisma.wallet.deleteMany({ where: { userId: id } });
  
  await prisma.user.delete({ where: { id } });
  console.log('Test user deleted successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
