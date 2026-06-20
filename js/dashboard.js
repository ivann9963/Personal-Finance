// === DASHBOARD ===
function renderDashboard() {
  const el = document.getElementById('tab-dashboard');
  const dc = S.settings.defaultCurrency;
  // Net worth
  const netWorth = S.accounts.reduce((sum, a) => {
    const c = defaultConvert(a.balance, a.currency);
    return sum + (c.ok ? c.amount : 0);
  }, 0);
  // Sparkline — last 30 days net worth (simplified: cumulative tx)
  const now = new Date();
  const sparkPoints = [];
  for (let i=29;i>=0;i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const dayNet = S.transactions
      .filter(t=>t.date<=ds)
      .reduce((s,t)=> t.type==='income'?s+t.convertedAmount : t.type==='expense'?s-t.convertedAmount:s, 0);
    sparkPoints.push(dayNet/100);
  }
  // Velocity
  const thisMonStr = now.toISOString().slice(0,7);
  const thisMoTx = S.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(thisMonStr));
  const spentSoFar = thisMoTx.reduce((s,t)=>s+t.convertedAmount,0);
  const diy = now.getDate();
  const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const projected = Math.round(spentSoFar / (diy/dim));
  let avgMonthly = 0;
  for(let i=1;i<=3;i++){
    const m = new Date(now.getFullYear(), now.getMonth()-i, 1).toISOString().slice(0,7);
    avgMonthly += S.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+t.convertedAmount,0);
  }
  avgMonthly = Math.round(avgMonthly/3);
  const velRatio = avgMonthly>0 ? projected/avgMonthly : 1;
  const velClass = velRatio>1.25?'vel-red':velRatio>1.1?'vel-amber':'vel-green';
  const velOver = projected - avgMonthly;
  const velText = `Day ${diy} of ${dim} · ${formatCurrency(spentSoFar,dc)} spent · on pace for ${formatCurrency(projected,dc)} this month`
    + (avgMonthly>0 ? ` · ${velOver>0?'+':'-'}${formatCurrency(Math.abs(velOver),dc)} ${velOver>0?'above':'below'} usual` : '');
  // Insights
  const insights = generateInsights();
  const insightCards = insights.length
    ? insights.map((ins,i)=>`
      <div class="insight-card" style="animation-delay:${i*50}ms">
        <button class="insight-dismiss" onclick="dismissInsight('${escHtml(ins.id)}')">✕</button>
        <div class="insight-icon">${ins.icon}</div>
        <div class="insight-hl">${escHtml(ins.headline)}</div>
        <div class="insight-detail">${escHtml(ins.detail)}</div>
      </div>`).join('')
    : `<div class="insight-card"><div class="insight-icon">✨</div><div class="insight-hl">All caught up!</div><div class="insight-detail">Add more transactions to get insights.</div></div>`;
  // Recent transactions
  const recentTx = [...S.transactions].slice(0,6);
  const recentHTML = recentTx.length
    ? recentTx.map(t=>txRowHTML(t)).join('')
    : `<div class="empty-state"><div style="font-size:40px;margin-bottom:12px">💸</div><div class="empty-state-title">No transactions yet</div><div class="empty-state-desc">Tap + to add your first transaction</div></div>`;
  // ATH banner
  const showATH = !window.navigator.standalone && !localStorage.getItem('ath_dismissed');
  // Stale-backup reminder — data lives only on this device, so nudge before it can be lost.
  const bk = (typeof backupStatus === 'function') ? backupStatus() : {stale:false};
  const snoozedAt = parseInt(localStorage.getItem('backup_reminder_snoozed')||'0', 10);
  const showBackupNudge = bk.stale && (Date.now() - snoozedAt > 7*864e5);
  el.innerHTML = `
    <div style="height:8px"></div>
    ${showBackupNudge?`<div class="ath-banner" style="background:var(--red-bg);border-color:var(--red)">
      <div class="ath-text">⚠️ <strong>No recent backup</strong> — your data lives only on this device. Back it up so a lost phone or cleared browser can't erase it.
        <button onclick="backupNowFromDashboard()" style="display:inline-block;margin-top:6px;color:var(--accent);font-weight:600;font-size:13px">Back Up Now →</button>
      </div>
      <button class="ath-dismiss" onclick="snoozeBackupReminder()">✕</button>
    </div>`:''}
    ${showATH?`<div class="ath-banner"><div class="ath-text"><strong>Add to Home Screen</strong> for the best experience — no browser chrome, works offline.</div><button class="ath-dismiss" onclick="dismissATH()">✕</button></div>`:''}
    <div class="hero-card">
      <div class="hero-label">Net Worth</div>
      <div class="hero-amount${netWorth<0?' negative':''}" id="hero-amount">${formatCurrency(netWorth,dc)}</div>
      <div class="sparkline-wrap"><canvas id="sparkline-canvas" height="48"></canvas></div>
    </div>
    <div class="velocity-strip ${velClass}" onclick="switchTab('analytics')">${escHtml(velText)}</div>
    <div class="section-hdr" style="padding-top:8px">Insights</div>
    <div class="insights-row">${insightCards}</div>
    <div class="recent-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px">
      <span style="font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px">Recent</span>
      <button class="see-all-btn" style="font-size:13px;color:var(--accent);font-weight:500" onclick="switchTab('transactions')">See all</button>
    </div>
    <div>${recentHTML}</div>
    <div style="height:8px"></div>`;
  // Animate net worth
  animateValue('hero-amount', 0, netWorth, 700, v => formatCurrency(Math.round(v), dc));
  // Sparkline
  requestAnimationFrame(() => mkSparkline('sparkline-canvas', sparkPoints));
}
function dismissInsight(id) {
  S.dismissedInsights.push({id, at: Date.now()});
  saveState(); renderDashboard();
}
function dismissATH() {
  localStorage.setItem('ath_dismissed','1');
  document.querySelector('.ath-banner')?.remove();
}
function backupNowFromDashboard() {
  exportJSON();        // records lastBackupAt → no longer stale
  renderDashboard();   // drop the nudge now that we're backed up
}
function snoozeBackupReminder() {
  localStorage.setItem('backup_reminder_snoozed', String(Date.now()));
  renderDashboard();
}
function animateValue(elId, from, to, duration, fmt) {
  const el = document.getElementById(elId); if (!el) return;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now-start)/duration, 1);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = fmt(from + (to-from)*eased);
    if (p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

