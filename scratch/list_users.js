const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { wallet: true }
  });
  console.log("Users in Database:");
  console.dir(users, { depth: null });
  await prisma.$disconnect();
}

main();
