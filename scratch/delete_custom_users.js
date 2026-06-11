const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const db = require('../db');

async function deleteUser(email) {
  email = email.toLowerCase();
  console.log(`\n-------------------------------------`);
  console.log(`Processing deletion for user: ${email}`);

  // 1. Delete from pg tables using raw sql
  try {
    const { rowCount: deletedContestTrades } = await db.query('DELETE FROM contest_trades WHERE user_email = $1', [email]);
    console.log(`Deleted ${deletedContestTrades} contest_trades records.`);
  } catch (err) {
    console.error(`Error deleting contest_trades:`, err.message);
  }

  try {
    const { rowCount: deletedContestParticipants } = await db.query('DELETE FROM contest_participants WHERE email = $1', [email]);
    console.log(`Deleted ${deletedContestParticipants} contest_participants records.`);
  } catch (err) {
    console.error(`Error deleting contest_participants:`, err.message);
  }

  try {
    const { rowCount: deletedStandardTrades } = await db.query('DELETE FROM trades WHERE user_email = $1', [email]);
    console.log(`Deleted ${deletedStandardTrades} standard trades from pg trades table.`);
  } catch (err) {
    console.error(`Error deleting pg trades:`, err.message);
  }

  // 2. Delete from Prisma managed tables
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`User ${email} not found in prisma user table.`);
    return;
  }

  const userId = user.id;
  console.log(`User ID is: ${userId}`);

  try {
    const deletedPayments = await prisma.payment.deleteMany({ where: { userId } });
    console.log(`Deleted ${deletedPayments.count} payment records.`);
  } catch (err) {
    console.error(`Error deleting payments:`, err.message);
  }

  try {
    const deletedTransactions = await prisma.transaction.deleteMany({ where: { userId } });
    console.log(`Deleted ${deletedTransactions.count} transaction records.`);
  } catch (err) {
    console.error(`Error deleting transactions:`, err.message);
  }

  try {
    const deletedPositions = await prisma.position.deleteMany({ where: { userId } });
    console.log(`Deleted ${deletedPositions.count} position records.`);
  } catch (err) {
    console.error(`Error deleting positions:`, err.message);
  }

  try {
    const deletedTrades = await prisma.trade.deleteMany({ where: { userId } });
    console.log(`Deleted ${deletedTrades.count} trade records.`);
  } catch (err) {
    console.error(`Error deleting trades:`, err.message);
  }

  try {
    const deletedWallet = await prisma.wallet.deleteMany({ where: { userId } });
    console.log(`Deleted ${deletedWallet.count} wallet records.`);
  } catch (err) {
    console.error(`Error deleting wallet:`, err.message);
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    console.log(`User ${email} deleted successfully from User table.`);
  } catch (err) {
    console.error(`Error deleting user from User table:`, err.message);
  }
}

async function main() {
  await deleteUser('rewefi4417@brixozu.com');
  await deleteUser('testuser@example.com');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
