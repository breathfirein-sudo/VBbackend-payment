const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execs = await prisma.supportExecutive.findMany();
  console.log(JSON.stringify(execs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
