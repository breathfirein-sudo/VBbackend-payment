const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  console.log('\n🔐 Converting plaintext passwords to bcrypt hashes...\n');

  // Find all users with plaintext (non-null, non-bcrypt) passwords
  const users = await p.user.findMany({ select: { id: true, email: true, password: true } });

  for (const u of users) {
    const pwd = u.password;
    if (!pwd) {
      console.log(`⏭  ID:${u.id} | ${u.email} — skipped (NULL password)`);
      continue;
    }
    const isBcrypt = pwd.startsWith('$2a$') || pwd.startsWith('$2b$') || pwd.startsWith('$2y$');
    if (isBcrypt) {
      console.log(`✅  ID:${u.id} | ${u.email} — already hashed, skipping`);
      continue;
    }

    // Hash the plaintext password
    const hashed = await bcrypt.hash(pwd, 10);
    await p.user.update({ where: { id: u.id }, data: { password: hashed } });
    console.log(`🔒  ID:${u.id} | ${u.email}`);
    console.log(`    Plaintext: ${pwd}`);
    console.log(`    Hash:      ${hashed}`);
    console.log(`    ✔ Updated in database`);
  }

  console.log('\n✅ Done! Verifying...\n');

  // Verify
  const after = await p.user.findMany({ select: { id: true, email: true, password: true } });
  after.forEach(u => {
    const pwd = u.password || 'NULL';
    const isBcrypt = pwd.startsWith('$2a$') || pwd.startsWith('$2b$') || pwd.startsWith('$2y$');
    const type = !u.password ? '❌ NULL' : (isBcrypt ? '✅ bcrypt' : '⚠️  PLAINTEXT');
    console.log(`ID:${u.id} | ${u.email} → ${type}`);
  });
}

main().catch(console.error).finally(() => p.$disconnect());
