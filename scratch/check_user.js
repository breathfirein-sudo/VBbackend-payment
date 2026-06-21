const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'shivaram' } },
    select: { id: true, email: true, name: true, isUnlocked: true }
  });
  console.log('Users matching shivaram:', users);
}
run().finally(() => prisma.$disconnect());
