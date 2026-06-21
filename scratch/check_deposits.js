const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const deposits = await prisma.manualDeposit.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  console.log('Recent deposits:', JSON.stringify(deposits, null, 2));
  const count = await prisma.manualDeposit.count();
  console.log('Total deposits:', count);
}
run().finally(() => prisma.$disconnect());
