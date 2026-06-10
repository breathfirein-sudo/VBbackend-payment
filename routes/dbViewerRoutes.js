const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/db-viewer', async (req, res) => {
  try {
    const users    = await prisma.user.findMany({ include: { wallet: true }, orderBy: { id: 'asc' } });
    const trades   = await prisma.trade.findMany({ take: 50, orderBy: { openedAt: 'desc' }, include: { user: { select: { email: true } } } });
    const txns     = await prisma.transaction.findMany({ take: 50, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true } } } });
    const payments = await prisma.payment.findMany({ take: 50, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true } } } });
    const counts   = {
      users: users.length,
      wallets: users.filter(u => u.wallet).length,
      trades: await prisma.trade.count(),
      positions: await prisma.position.count(),
      transactions: await prisma.transaction.count(),
      payments: await prisma.payment.count(),
      candles: await prisma.candle.count(),
      marketTicks: await prisma.marketTick.count(),
    };

    const fmt = (n) => n == null ? '<span class="null">NULL</span>' : String(n);
    const money = (n) => n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const date  = (d) => d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '—';
    const badge = (txt, color) => `<span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${txt}</span>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DB Viewer — VB Exchange</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#080b14;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh}
  .topbar{background:#0d1117;border-bottom:1px solid #1e293b;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
  .topbar h1{font-size:18px;font-weight:800;color:#f0b429;letter-spacing:0.5px}
  .topbar small{font-size:12px;color:#64748b}
  .refresh{background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:7px 16px;border-radius:8px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}
  .refresh:hover{color:#fff;border-color:#64748b}
  .wrapper{padding:28px 32px;display:flex;flex-direction:column;gap:32px;max-width:1600px;margin:0 auto}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:#0d1117;border:1px solid #1e293b;border-radius:12px;padding:16px;text-align:center}
  .stat .num{font-size:28px;font-weight:800;color:#f0b429;line-height:1}
  .stat .lbl{font-size:11px;color:#64748b;margin-top:6px;text-transform:uppercase;letter-spacing:0.5px}
  .section{background:#0d1117;border:1px solid #1e293b;border-radius:14px;overflow:hidden}
  .sec-head{padding:16px 20px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between}
  .sec-head h2{font-size:14px;font-weight:700;color:#fff}
  .sec-head span{font-size:12px;color:#64748b}
  .tbl-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#111827;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;padding:10px 14px;text-align:left;border-bottom:1px solid #1e293b;white-space:nowrap}
  td{padding:9px 14px;border-bottom:1px solid #0f172a;color:#cbd5e1;white-space:nowrap}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#111827}
  .null{color:#334155;font-style:italic}
  .badge{padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}
  .empty{padding:32px;text-align:center;color:#334155;font-size:13px}
  .green{color:#10b981;font-weight:700}
  .gold{color:#f0b429;font-weight:700}
  .red{color:#ef4444}
  .muted{color:#475569}
  .hash{font-family:monospace;font-size:10px;color:#64748b;max-width:220px;overflow:hidden;text-overflow:ellipsis;display:inline-block;vertical-align:middle}
</style>
</head>
<body>
<div class="topbar">
  <h1>🗄️ VB Exchange — Database Viewer</h1>
  <div style="display:flex;align-items:center;gap:12px">
    <small>Updated: ${new Date().toLocaleString('en-IN')}</small>
    <a href="/db-viewer" class="refresh">⟳ Refresh</a>
  </div>
</div>
<div class="wrapper">

  <!-- Stats -->
  <div class="stat-grid">
    ${Object.entries(counts).map(([k,v]) => `<div class="stat"><div class="num">${v}</div><div class="lbl">${k}</div></div>`).join('')}
  </div>

  <!-- Users -->
  <div class="section">
    <div class="sec-head"><h2>👤 Users</h2><span>${counts.users} rows</span></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Password</th><th>Wallet Balance</th><th>Locked</th><th>Total PnL</th><th>Created</th></tr></thead>
      <tbody>
      ${users.length === 0 ? `<tr><td colspan="8" class="empty">No users</td></tr>` :
        users.map(u => {
          const pwd = u.password || '';
          const isBcrypt = pwd.startsWith('$2a$') || pwd.startsWith('$2b$') || pwd.startsWith('$2y$');
          let pwdCell;
          if (!u.password) {
            pwdCell = `<span class="badge" style="background:#ef444420;color:#ef4444;border:1px solid #ef444440">NULL</span>`;
          } else if (isBcrypt) {
            pwdCell = `<span class="badge" style="background:#10b98120;color:#10b981;border:1px solid #10b98140">🔒 bcrypt</span> <span class="hash">${pwd.slice(0,30)}…</span>`;
          } else {
            pwdCell = `<span class="badge" style="background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b40">⚠️ plaintext</span> <span style="color:#f59e0b;font-family:monospace;font-size:11px">${pwd}</span>`;
          }
          return `<tr>
          <td class="muted">${u.id}</td>
          <td>${u.email}</td>
          <td>${u.name || '<span class="null">null</span>'}</td>
          <td>${pwdCell}</td>
          <td class="green">${u.wallet ? money(u.wallet.balance) : '<span class="null">no wallet</span>'}</td>
          <td>${u.wallet ? money(u.wallet.lockedAmount) : '—'}</td>
          <td class="${u.wallet && u.wallet.totalPnl >= 0 ? 'green' : 'red'}">${u.wallet ? money(u.wallet.totalPnl) : '—'}</td>
          <td class="muted">${date(u.createdAt)}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
  </div>

  <!-- Transactions -->
  <div class="section">
    <div class="sec-head"><h2>💳 Transactions</h2><span>Last 50 of ${counts.transactions}</span></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>ID</th><th>User</th><th>Type</th><th>Asset</th><th>Amount</th><th>Fee</th><th>GST</th><th>Details</th><th>Created</th></tr></thead>
      <tbody>
      ${txns.length === 0 ? `<tr><td colspan="9" class="empty">No transactions yet</td></tr>` :
        txns.map(t => `<tr>
          <td class="muted">${t.id}</td>
          <td>${t.user.email}</td>
          <td>${badge(t.type, t.type==='buy'?'#a855f7':t.type==='sell'?'#f0b429':t.type==='deposit'?'#10b981':'#ef4444')}</td>
          <td>${t.asset}</td>
          <td class="gold">${money(t.amount)}</td>
          <td>${t.fee != null ? money(t.fee) : '—'}</td>
          <td>${t.gst != null ? money(t.gst) : '—'}</td>
          <td class="muted">${t.details || '—'}</td>
          <td class="muted">${date(t.createdAt)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>

  <!-- Payments -->
  <div class="section">
    <div class="sec-head"><h2>💰 Payments (Razorpay)</h2><span>Last 50 of ${counts.payments}</span></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>ID</th><th>User</th><th>Order ID</th><th>Payment ID</th><th>Amount</th><th>Currency</th><th>Status</th><th>Method</th><th>Created</th></tr></thead>
      <tbody>
      ${payments.length === 0 ? `<tr><td colspan="9" class="empty">No payments yet</td></tr>` :
        payments.map(p => `<tr>
          <td class="muted">${p.id.slice(0,8)}…</td>
          <td>${p.user.email}</td>
          <td class="muted">${p.orderId}</td>
          <td class="muted">${p.paymentId || '—'}</td>
          <td class="gold">${money(p.amount)}</td>
          <td>${p.currency}</td>
          <td>${badge(p.status, p.status==='paid'?'#10b981':p.status==='created'?'#f59e0b':'#ef4444')}</td>
          <td>${p.paymentMethod || '—'}</td>
          <td class="muted">${date(p.createdAt)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>

  <!-- Trades -->
  <div class="section">
    <div class="sec-head"><h2>📈 Trades</h2><span>Last 50 of ${counts.trades}</span></div>
    <div class="tbl-wrap">
    <table>
      <thead><tr><th>ID</th><th>User</th><th>Asset</th><th>Side</th><th>Amount</th><th>Qty</th><th>Leverage</th><th>Entry</th><th>Exit</th><th>Net PnL</th><th>Status</th><th>Opened</th></tr></thead>
      <tbody>
      ${trades.length === 0 ? `<tr><td colspan="12" class="empty">No trades yet</td></tr>` :
        trades.map(t => `<tr>
          <td class="muted">${t.id}</td>
          <td>${t.user.email}</td>
          <td>${t.asset}</td>
          <td>${badge(t.side, t.side==='buy'?'#10b981':'#ef4444')}</td>
          <td class="gold">${money(t.amount)}</td>
          <td>${t.quantity}</td>
          <td>${t.leverage}x</td>
          <td>${t.entryPrice}</td>
          <td>${t.exitPrice ?? '—'}</td>
          <td class="${t.netPnl >= 0 ? 'green' : 'red'}">${t.netPnl != null ? money(t.netPnl) : '—'}</td>
          <td>${badge(t.status, t.status==='open'?'#f59e0b':t.status==='closed'?'#10b981':'#64748b')}</td>
          <td class="muted">${date(t.openedAt)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>

</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('<pre style="color:red;background:#111;padding:24px;font-family:monospace">DB Viewer Error:\n' + err.stack + '</pre>');
  }
});

module.exports = router;
