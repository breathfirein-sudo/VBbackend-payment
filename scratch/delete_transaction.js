require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndDeleteTx() {
  try {
    const payoutId = 'pout_sim_1780907622602_9039';

    // Find any transaction with details containing the payoutId
    const transactions = await prisma.transaction.findMany({
      where: {
        details: {
          contains: payoutId
        }
      }
    });

    console.log(`Found ${transactions.length} matching transactions:`);
    for (const tx of transactions) {
      console.log('Transaction:', tx);
      const deleted = await prisma.transaction.delete({
        where: { id: tx.id }
      });
      console.log('Deleted Transaction:', deleted);
    }

  } catch (error) {
    console.error('Error querying/deleting transaction:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndDeleteTx();
