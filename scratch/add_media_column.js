const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Altering 'SupportMessage' table to add 'mediaUrl' column...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;
    `);
    console.log("✅ Column added successfully!");
  } catch (error) {
    console.error("❌ Failed to add column:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
