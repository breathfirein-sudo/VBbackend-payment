const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({ select: { id: true, email: true, password: true } })
  .then(users => {
    console.log('\n=== PASSWORDS IN DATABASE ===\n');
    users.forEach(u => {
      const pwd = u.password || 'NULL';
      const isBcrypt = pwd.startsWith('$2a$') || pwd.startsWith('$2b$') || pwd.startsWith('$2y$');
      const type = u.password ? (isBcrypt ? '🔒 bcrypt hash' : '⚠️  PLAINTEXT') : '❌ NULL';
      console.log(`ID: ${u.id} | ${u.email}`);
      console.log(`  Type: ${type}`);
      console.log(`  Stored: ${pwd.slice(0, 60)}${pwd.length > 60 ? '...' : ''}`);
      console.log('');
    });
  })
  .finally(() => p.$disconnect());
