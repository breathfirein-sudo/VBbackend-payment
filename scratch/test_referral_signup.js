const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BACKEND_URL = 'http://localhost:5000';
const referrerEmail = `referrer_${Date.now()}@example.com`;
const inviteeEmail = `invitee_${Date.now()}@example.com`;
const testPassword = 'Password123!';

async function runTests() {
  console.log("Starting Referral Signup flow verification tests...\n");

  try {
    // 1. Create a Referrer user
    console.log(`1. Registering Referrer: ${referrerEmail}`);
    const regReferrerRes = await axios.post(`${BACKEND_URL}/api/auth/register`, {
      email: referrerEmail,
      password: testPassword,
      name: 'Referrer User'
    });

    if (!regReferrerRes.data.success) {
      throw new Error("Failed to register Referrer");
    }

    const referrerId = regReferrerRes.data.user.id;
    const referrerUsername = referrerEmail.split('@')[0].toUpperCase();
    const referralCode = `IH-${referrerUsername}`;
    console.log(`✅ Referrer registered. ID: ${referrerId}. Referral Code: ${referralCode}`);

    // Verify initial wallet balance of referrer
    let referrerWallet = await prisma.wallet.findUnique({
      where: { userId: referrerId }
    });
    console.log(`✅ Referrer Initial Wallet Balance: ₹${referrerWallet.balance}`);

    // 2. Create an Invitee user signing up with the referral code
    console.log(`\n2. Registering Invitee: ${inviteeEmail} using referral code: ${referralCode}`);
    const regInviteeRes = await axios.post(`${BACKEND_URL}/api/auth/register`, {
      email: inviteeEmail,
      password: testPassword,
      name: 'Invitee User',
      referralCode: referralCode
    });

    if (!regInviteeRes.data.success) {
      throw new Error("Failed to register Invitee");
    }

    console.log(`✅ Invitee registered successfully.`);

    // 3. Verify that the referrer's wallet balance has increased by 10 Rupees
    console.log("\n3. Verifying referrer wallet balance update in PostgreSQL...");
    referrerWallet = await prisma.wallet.findUnique({
      where: { userId: referrerId }
    });

    console.log(`✅ Referrer Updated Wallet Balance: ₹${referrerWallet.balance}`);
    if (referrerWallet.balance === 100010) {
      console.log("\n🎉 SUCCESS: Referrer wallet balance successfully incremented by ₹10!");
    } else {
      throw new Error(`Referrer balance was expected to be 100010, but got: ${referrerWallet.balance}`);
    }

  } catch (error) {
    console.error("❌ Test failed:", error.response ? error.response.data : error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
