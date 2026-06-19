const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const executives = await prisma.supportExecutive.findMany();
    console.log("SUPPORT_EXECUTIVES_LIST:", JSON.stringify(executives, null, 2));
  } catch (error) {
    console.error("FAILED_TO_LIST_EXECUTIVES:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
