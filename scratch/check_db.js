const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const executives = await prisma.supportExecutive.findMany();
    console.log("Support Executives in DB:", JSON.stringify(executives, null, 2));

    const callRequests = await prisma.callRequest.findMany();
    console.log("Call Requests in DB:", JSON.stringify(callRequests, null, 2));

    const manualDeposits = await prisma.manualDeposit.findMany();
    console.log("Manual Deposits in DB:", JSON.stringify(manualDeposits, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
