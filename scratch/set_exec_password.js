const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  const updated = await prisma.supportExecutive.updateMany({
    where: { email: 'kshivaprasad33987@gmail.com' },
    data: { password: hashedPassword }
  });
  console.log("Updated support executive:", updated);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
