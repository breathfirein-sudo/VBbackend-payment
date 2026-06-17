const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Run raw SQL to create SupportExecutive table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupportExecutive" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "phone" TEXT,
        "email" TEXT,
        "role" TEXT NOT NULL,
        "salary" DOUBLE PRECISION NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "shift" TEXT NOT NULL DEFAULT 'Day',
        "languages" TEXT NOT NULL DEFAULT 'English, Hindi',
        "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
        "experienceYrs" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      );
    `);
    console.log("Successfully created 'SupportExecutive' table in the database.");
  } catch (error) {
    console.error("Failed to create SupportExecutive table:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
