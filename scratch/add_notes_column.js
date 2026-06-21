// Add 'notes' column to ManualDeposit table safely
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Add notes column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ManualDeposit" 
      ADD COLUMN IF NOT EXISTS "notes" TEXT;
    `);
    console.log('✅ Successfully added "notes" column to ManualDeposit table.');
    
    // Backfill existing records: if amount=10 and user is locked → unlock_fee, otherwise wallet_deposit
    await prisma.$executeRawUnsafe(`
      UPDATE "ManualDeposit" md
      SET "notes" = CASE
        WHEN md.amount = 10 AND EXISTS (
          SELECT 1 FROM "User" u WHERE u.id = md."userId" AND u."isUnlocked" = false
        ) THEN 'unlock_fee'
        ELSE 'wallet_deposit'
      END
      WHERE "notes" IS NULL;
    `);
    console.log('✅ Backfilled notes for existing ManualDeposit records.');
    
    // Also regenerate the Prisma client
    console.log('Done! Run "npx prisma generate" to update the Prisma client.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
