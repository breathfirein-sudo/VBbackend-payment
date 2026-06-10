const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      include: { wallet: true }
    });

    console.log(`Found ${users.length} users in database.`);

    for (const user of users) {
      // Create wallet if missing
      if (!user.wallet) {
        await prisma.wallet.create({
          data: {
            userId: user.id,
            balance: 25000.0, // seed ₹25,000 for testing
            lockedAmount: 0,
            totalPnl: 0,
            winRate: 0
          }
        });
        console.log(`Created wallet for ${user.email} with ₹25,000 balance.`);
      } else {
        // Update wallet balance to ₹25,000 for testing
        await prisma.wallet.update({
          where: { userId: user.id },
          data: { balance: 25000.0 }
        });
        console.log(`Reset wallet balance for ${user.email} to ₹25,000.`);
      }

      // Ensure they have referral count of 2 so their vault is unlocked
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCount: 2 }
      });
      console.log(`Set referralCount = 2 for ${user.email}.`);
    }

    console.log("Successfully seeded wallets and referral counts.");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
