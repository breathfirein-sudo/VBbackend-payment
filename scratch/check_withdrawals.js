const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const withdrawals = await prisma.payment.findMany({
    where: {
      paymentMethod: {
        contains: 'withdrawal'
      }
    },
    include: {
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });
  console.log("Withdrawals in Database:");
  console.dir(withdrawals, { depth: null });
  await prisma.$disconnect();
}

main();
