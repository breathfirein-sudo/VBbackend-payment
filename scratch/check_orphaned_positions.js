const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log("Checking for Positions with null userId referencing user trades...");
    const positions = await prisma.position.findMany({
      where: {
        userId: null
      },
      include: {
        trade: true
      }
    });

    console.log(`Found ${positions.length} positions with null userId.`);
    positions.forEach(p => {
      console.log(`Position ID: ${p.id}, Trade ID: ${p.tradeId}, Trade User ID: ${p.trade?.userId}`);
    });

  } catch (error) {
    console.error("Error checking positions:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
