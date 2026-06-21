const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { id: 63 },
      include: {
        wallet: true,
        manualDeposits: true,
        transactions: true,
        payments: true
      }
    });
    console.log("=== User 63 Full Details ===");
    console.log(JSON.stringify(user, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}
main();

