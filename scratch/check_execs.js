const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const execs = await prisma.supportExecutive.findMany();
  console.log(execs);
}
run().finally(() => prisma.$disconnect());
