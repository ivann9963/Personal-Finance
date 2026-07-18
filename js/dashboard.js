// === DASHBOARD ===
function renderDashboard() {
  const el = document.getElementById('tab-dashboard');
  const dc = S.settings.defaultCurrency;
  const now = new Date();

  // Banners — show at most one; a real backup warning outranks the install hint.
  const showATH = !window.navigator.standalone && !localStorage.getItem('ath_dismissed');
  const bk = (typeof backupStatus === 'function') ? backupStatus() : {stale:false};
  const snoozedAt = parseInt(localStorage.getItem('backup_reminder_snoozed')||'0', 10);
  const showBackupNudge = bk.stale && (Date.now() - snoozedAt > 7*864e5);
  const athBanner = `<div class="ath-banner"><div class="ath-text"><strong>Add to Home Screen</strong> for the best experience — no browser chrome, works offline.</div><button class="ath-dismiss" onclick="dismissATH()">✕</button></div>`;
  const backupBanner = `<div class="ath-banner" style="background:var(--red-bg);border-color:var(--red)">
      <div class="ath-text">⚠️ <strong>No recent backup</strong> — your data lives only on this device. Back it up so a lost phone or cleared browser can't erase it.
        <button onclick="backupNowFromDashboard()" style="display:inline-block;margin-top:6px;color:var(--accent);font-weight:600;font-size:13px">Back Up Now →</button>
      </div>
      <button class="ath-dismiss" onclick="snoozeBackupReminder()">✕</button>
    </div>`;
  const banner = showBackupNudge ? backupBanner : (showATH ? athBanner : '');

  // First-run welcome — invite the first action instead of an empty €0 dashboard.
  if (!S.accounts.length && !S.transactions.length) {
    el.innerHTML = `
      <div style="height:8px"></div>
      ${showATH ? athBanner : ''}
      <div style="padding:28px 20px 14px;text-align:center">
        <div style="font-size:52px;margin-bottom:6px">👋</div>
        <div style="font-size:22px;font-weight:800;margin-bottom:6px">Welcome to Finance</div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;max-width:300px;margin:0 auto">See where your money goes, stay on budget, and watch your savings grow — all private, on your device.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;padding:0 16px">
        ${getStartedRow('openAddTxSheet()', '➕', 'Add your first transaction', 'Log what you spent or earned')}
        ${getStartedRow('openAddAccountSheet()', '🏦', 'Add an account', 'Track balances and net worth')}
        ${getStartedRow('dashboardImport()', '📥', 'Import from your bank', 'CSV or Excel — Revolut, N26, Wise…')}
        ${getStartedRow('loadSampleData()', '🎲', 'Explore with sample data', 'See how it all works')}
      </div>
      <div style="height:16px"></div>`;
    return;
  }

  // Net worth
  const netWorth = S.accounts.reduce((sum, a) => {
    const c = defaultConvert(a.balance, a.currency);
    return sum + (c.ok ? c.amount : 0);
  }, 0);
  // Accounts we couldn't convert are excluded from the figure above — flag them so the headline
  // number is never silently wrong.
  const needRateCount = S.accounts.filter(accountNeedsRate).length;
  // Sparkline — cumulative net flow over the last 30 days
  const sparkPoints = [];
  for (let i=29;i>=0;i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const dayNet = S.transactions
      .filter(t=>t.date<=ds)
      .reduce((s,t)=> t.type==='income'?s+t.convertedAmount : t.type==='expense'?s-t.convertedAmount:s, 0);
    sparkPoints.push(dayNet/100);
  }
  // 30-day change (cash flow) — a motivating "are things trending up?" signal on the hero.
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate()-30);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  const flow30 = S.transactions.filter(t=>t.date>cutoffStr)
    .reduce((s,t)=> t.type==='income'?s+t.convertedAmount : t.type==='expense'?s-t.convertedAmount : s, 0);
  const hasFlow = S.transactions.length>0;

  // Velocity (only meaningful once there's spending this month)
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
  const showVelocity = thisMoTx.length>0;
  // Insights
  const insights = generateInsights();
  const insightCards = insights.length
    ? insights.map((ins,i)=>`
      <div class="insight-card" style="animation-delay:${i*50}ms">
        <button class="insight-dismiss" onclick="dismissInsight('${jsAttr(ins.id)}')">✕</button>
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
  el.innerHTML = `
    <div style="height:8px"></div>
    ${banner}
    <div class="hero-card">
      <div class="hero-label">Net Worth</div>
      <div class="hero-amount${netWorth<0?' negative':''}" id="hero-amount">${formatCurrency(netWorth,dc)}</div>
      ${hasFlow?`<div style="font-size:13px;font-weight:600;margin-top:2px;color:${flow30>=0?'var(--green)':'var(--red)'}">${flow30>=0?'▲':'▼'} ${formatCurrency(Math.abs(flow30),dc)} <span style="color:var(--text-tertiary);font-weight:500">· last 30 days</span></div>`:''}
      ${needRateCount?`<div class="hero-rate-warn" onclick="switchTab('accounts')">⚠️ ${needRateCount} account${needRateCount>1?'s':''} not included — set an exchange rate</div>`:''}
      <div class="sparkline-wrap"><canvas id="sparkline-canvas" height="48"></canvas></div>
    </div>
    ${showVelocity?`<div class="velocity-strip ${velClass}" onclick="switchTab('analytics')">${escHtml(velText)}</div>`:''}
    ${wealthTeaserHTML()}
    <div class="section-hdr" style="padding-top:8px">Insights</div>
    <div class="insights-row">${insightCards}</div>
    <div class="recent-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px">
      <span style="font-size:14px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px">Recent</span>
      <button class="see-all-btn" style="font-size:13px;color:var(--accent);font-weight:500" onclick="switchTab('transactions')">See all</button>
    </div>
    <div>${recentHTML}</div>
    <div style="height:8px"></div>`;
  // Animate net worth — count up from 0 on first view, then tick from the last shown
  // value on later renders so a change reads as a smooth adjustment, not a full re-roll.
  animateValue('hero-amount', _lastHeroNet ?? 0, netWorth, 700, v => formatCurrency(Math.round(v), dc));
  _lastHeroNet = netWorth;
  // Sparkline
  requestAnimationFrame(() => mkSparkline('sparkline-canvas', sparkPoints));
}
// One tappable "get started" row for the first-run dashboard.
function getStartedRow(onclick, emoji, title, sub) {
  return `<button onclick="${onclick}" style="display:flex;align-items:center;gap:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;width:100%;text-align:left;cursor:pointer">
    <span style="font-size:24px;flex-shrink:0">${emoji}</span>
    <span style="flex:1;min-width:0"><span style="display:block;font-weight:600;font-size:15px">${title}</span><span style="display:block;font-size:12.5px;color:var(--text-secondary)">${sub}</span></span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-tertiary);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
  </button>`;
}
// First-run "Import from your bank" — ensure a target account exists, then open the importer.
function dashboardImport() {
  if (!S.accounts.length) {
    const c = defaultConvert(0, S.settings.defaultCurrency);
    S.accounts.push({id:gid(), name:'Main Account', type:'checking', balance:0, currency:S.settings.defaultCurrency, institution:'', convertedBalance:c.ok?c.amount:0});
    saveState();
  }
  openCSVImport();
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
let _lastHeroNet = null; // last net-worth shown on the hero, so re-renders tick instead of re-rolling
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

