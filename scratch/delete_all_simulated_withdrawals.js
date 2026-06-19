const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Find all simulated payments
    const payments = await prisma.payment.findMany({
      where: {
        paymentMethod: {
          in: ['bank_withdrawal_sim', 'upi_withdrawal_sim']
        }
      }
    });

    console.log(`Found ${payments.length} simulated payment record(s) to delete.`);

    // 2. Loop and delete each payment and its related transactions
    for (const payment of payments) {
      console.log(`Deleting Payment: ID=${payment.id}, OrderId=${payment.orderId}, Amount=${payment.amount}`);

      // Delete transactions containing the orderId
      const deletedTxs = await prisma.transaction.deleteMany({
        where: {
          details: {
            contains: payment.orderId
          }
        }
      });
      console.log(`  Deleted ${deletedTxs.count} matching transaction(s).`);

      // Delete the payment record
      await prisma.payment.delete({
        where: {
          id: payment.id
        }
      });
      console.log(`  Deleted payment record.`);
    }

    console.log("Cleanup of all simulated dummy data complete!");

  } catch (error) {
    console.error("Error during cleanup:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
