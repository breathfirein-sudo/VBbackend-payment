const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'withdraw_test@example.com';
  const name = 'Withdraw Limit Test User';
  const plainPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      name,
    },
    create: {
      email,
      name,
      password: hashedPassword,
    },
  });

  // Upsert wallet
  const wallet = await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {
      balance: 1000,
    },
    create: {
      userId: user.id,
      balance: 1000,
    },
  });

  console.log(`Test user setup completed:`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${plainPassword}`);
  console.log(`Wallet Balance: ₹${wallet.balance}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
