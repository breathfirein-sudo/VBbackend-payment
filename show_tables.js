const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ include: { wallet: true } });
  console.log('\n=== USERS (' + users.length + ') ===');
  console.log('ID  | Email                              | Name                | Wallet Balance | Created');
  console.log('----|------------------------------------|--------------------|----------------|----------');
  users.forEach(u => {
    const bal = u.wallet ? ('Rs.' + u.wallet.balance.toFixed(2)) : 'no wallet';
    console.log(String(u.id).padEnd(4) + '| ' + u.email.padEnd(35) + '| ' + (u.name||'').padEnd(19) + '| ' + bal.padEnd(15) + '| ' + u.createdAt.toISOString().slice(0,10));
  });

  const trades = await prisma.trade.count();
  const positions = await prisma.position.count();
  const transactions = await prisma.transaction.count();
  const payments = await prisma.payment.count();
  const candles = await prisma.candle.count();
  const ticks = await prisma.marketTick.count();

  console.log('\n=== TABLE ROW COUNTS ===');
  console.log('  User:         ' + users.length);
  console.log('  Wallet:       ' + users.filter(u => u.wallet).length);
  console.log('  Trade:        ' + trades);
  console.log('  Position:     ' + positions);
  console.log('  Transaction:  ' + transactions);
  console.log('  Payment:      ' + payments);
  console.log('  Candle:       ' + candles);
  console.log('  MarketTick:   ' + ticks);

  const recentTx = await prisma.transaction.findMany({ take: 15, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true } } } });
  console.log('\n=== RECENT TRANSACTIONS (last 15) ===');
  console.log('Date-Time        | Email                              | Type    | Asset  | Amount');
  console.log('-----------------|------------------------------------|---------|---------|---------');
  recentTx.forEach(t => {
    console.log(t.createdAt.toISOString().slice(0,16) + ' | ' + t.user.email.padEnd(35) + '| ' + t.type.padEnd(8) + '| ' + t.asset.padEnd(8) + '| ' + t.amount);
  });

  const recentPay = await prisma.payment.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true } } } });
  console.log('\n=== RECENT PAYMENTS (last 10) ===');
  console.log('Date-Time        | Email                              | Status   | Amount | OrderId');
  console.log('-----------------|------------------------------------|---------|---------|---------');
  recentPay.forEach(p => {
    console.log(p.createdAt.toISOString().slice(0,16) + ' | ' + p.user.email.padEnd(35) + '| ' + p.status.padEnd(9) + '| Rs.' + p.amount + ' | ' + p.orderId);
  });

  const recentTrades = await prisma.trade.findMany({ take: 10, orderBy: { openedAt: 'desc' }, include: { user: { select: { email: true } } } });
  console.log('\n=== RECENT TRADES (last 10) ===');
  console.log('Date-Time        | Email                              | Asset  | Side | Amount  | Status');
  console.log('-----------------|------------------------------------|---------|----|---------|--------');
  recentTrades.forEach(t => {
    console.log(t.openedAt.toISOString().slice(0,16) + ' | ' + t.user.email.padEnd(35) + '| ' + t.asset.padEnd(8) + '| ' + t.side.padEnd(5) + '| ' + t.amount + ' | ' + t.status);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
