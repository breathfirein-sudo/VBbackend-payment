const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Add the column phone to "User" table if it doesn't exist
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;`);
    console.log("Successfully ran ALTER TABLE query to add 'phone' column to 'User' table.");
  } catch (error) {
    console.error("Failed to add column:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
