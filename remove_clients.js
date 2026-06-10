const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'sandeepkumar.pikili@vrpigroup.co.in';

async function main() {
  // Find all non-admin users
  const toDelete = await p.user.findMany({
    where: { email: { not: SUPER_ADMIN_EMAIL } },
    select: { id: true, email: true }
  });

  if (toDelete.length === 0) {
    console.log('No clients to remove.');
    return;
  }

  console.log(`\n🗑  Removing ${toDelete.length} client(s):\n`);
  toDelete.forEach(u => console.log(`  - ID:${u.id} | ${u.email}`));

  const ids = toDelete.map(u => u.id);

  // Delete in dependency order (child tables first)
  const del = async (model, label) => {
    const result = await p[model].deleteMany({ where: { userId: { in: ids } } });
    console.log(`  ✔ Deleted ${result.count} ${label}`);
  };

  console.log('\nDeleting related records...');
  await del('payment',     'payment(s)');
  await del('transaction', 'transaction(s)');
  await del('position',    'position(s)');
  await del('trade',       'trade(s)');
  await del('wallet',      'wallet(s)');

  // Delete the users
  const deleted = await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`  ✔ Deleted ${deleted.count} user(s)`);

  console.log('\n✅ Done! Remaining users:\n');
  const remaining = await p.user.findMany({ select: { id: true, email: true, name: true } });
  remaining.forEach(u => console.log(`  ID:${u.id} | ${u.email} | ${u.name}`));
}

main().catch(console.error).finally(() => p.$disconnect());
