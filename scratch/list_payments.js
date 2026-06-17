const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.payment.findMany({
    include: {
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });
  console.log("Payments in Database:");
  console.dir(payments, { depth: null });
  await prisma.$disconnect();
}

main();
