const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  try {
    const email = 'abrarali99890@gmail.com';
    const newPassword = 'Password123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    console.log(`Password reset successful for user: ${user.email}`);
    console.log(`Test credentials:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);
  } catch (error) {
    console.error('Failed to reset password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
