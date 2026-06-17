const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'kshivaprasad33987@gmail.com';
  const plainPassword = '1e2b665b';
  
  try {
    const exec = await prisma.supportExecutive.findFirst({
      where: { email }
    });
    
    if (!exec) {
      console.log(`Support Executive with email ${email} not found.`);
      return;
    }
    
    const isMatch = await bcrypt.compare(plainPassword, exec.password);
    console.log(`Password match status for '${plainPassword}':`, isMatch);
    
    if (!isMatch) {
      console.log("Updating password hash in database to match '1e2b665b'...");
      const newHash = await bcrypt.hash(plainPassword, 10);
      await prisma.supportExecutive.update({
        where: { id: exec.id },
        data: { password: newHash }
      });
      console.log("Password hash updated successfully!");
      
      // Verify again
      const updatedExec = await prisma.supportExecutive.findUnique({
        where: { id: exec.id }
      });
      const isNowMatch = await bcrypt.compare(plainPassword, updatedExec.password);
      console.log("New password match verification:", isNowMatch);
    }
  } catch (error) {
    console.error("Error checking/updating password:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
