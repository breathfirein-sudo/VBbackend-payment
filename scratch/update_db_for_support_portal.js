const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Altering 'SupportExecutive' table to add 'password' and 'attendance' columns...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SupportExecutive" ADD COLUMN IF NOT EXISTS "password" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SupportExecutive" ADD COLUMN IF NOT EXISTS "attendance" TEXT DEFAULT '[]';
    `);

    console.log("Creating 'SupportMessage' table if not exists...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupportMessage" (
        "id" SERIAL PRIMARY KEY,
        "sender" TEXT NOT NULL,
        "userEmail" TEXT NOT NULL,
        "execId" INTEGER,
        "text" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Creating 'CallRequest' table if not exists...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CallRequest" (
        "id" SERIAL PRIMARY KEY,
        "userEmail" TEXT NOT NULL,
        "userName" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Database tables and columns updated successfully!");
  } catch (error) {
    console.error("❌ Failed to update database schema:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
