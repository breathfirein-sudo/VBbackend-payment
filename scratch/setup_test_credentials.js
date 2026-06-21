const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  try {
    const userPass = await bcrypt.hash('password123', 10);
    const execPass = await bcrypt.hash('execpass123', 10);

    // Update or create user testuser@example.com
    const user = await prisma.user.upsert({
      where: { email: 'testuser@example.com' },
      update: { password: userPass },
      create: {
        email: 'testuser@example.com',
        name: 'Test User',
        password: userPass,
        isUnlocked: false,
        wallet: { create: { balance: 0 } }
      }
    });
    console.log("Test user configured successfully:", user.email);

    // Update executive kshivaprasad33987@gmail.com password
    const exec = await prisma.supportExecutive.updateMany({
      where: { email: 'kshivaprasad33987@gmail.com' },
      data: { password: execPass }
    });
    console.log("Support executive password updated count:", exec.count);

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}
main();
