// === FUTURE WEALTH & INVESTMENTS ===
// Projection engine (pure, unit-tested) + the Future Wealth sheet and its dashboard teaser.
// All money values are integer cents in the default currency unless noted.

// Net worth exactly as the dashboard hero computes it: sum of converted balances.
function netWorthNow() {
  return S.accounts.reduce((sum, a) => {
    const c = defaultConvert(a.balance, a.currency);
    return sum + (c.ok ? c.amount : 0);
  }, 0);
}

// Compound a starting amount with monthly contributions at an annual return.
// Returns [start, m1, m2, …] — months+1 points. Contributions are added at month end.
function projectWealth(start, monthlyContribution, annualRatePct, months) {
  const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1; // effective monthly rate
  const out = [start];
  let v = start;
  for (let i = 0; i < months; i++) {
    v = v * (1 + r) + monthlyContribution;
    out.push(Math.round(v));
  }
  return out;
}

// Months until the projection first reaches `target` (null if not within `capMonths`).
function monthsToReach(target, start, monthlyContribution, annualRatePct, capMonths = 600) {
  if (start >= target) return 0;
  const r = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  let v = start;
  for (let m = 1; m <= capMonths; m++) {
    v = v * (1 + r) + monthlyContribution;
    if (v >= target) return m;
  }
  return null;
}

// Average monthly net cash flow (income − expense) over the last `months` full calendar
// months — the default "how much do I add each month". Transfers don't count (they move
// money between accounts, they don't create it). Months with no transactions count as 0
// only when inside the user's actual history, so a 2-week-old app isn't averaged over 6 months.
function avgMonthlySavings(months = 6) {
  if (!S.transactions.length) return 0;
  const now = new Date();
  const keys = [];
  for (let i = 1; i <= months; i++) {
    keys.push(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  }
  const earliest = S.transactions.reduce((min, t) => t.date < min ? t.date : min, '9999');
  const usable = keys.filter(k => k >= earliest.slice(0, 7));
  if (!usable.length) return 0;
  const net = usable.reduce((sum, k) => sum + S.transactions
    .filter(t => t.date.startsWith(k))
    .reduce((s, t) => t.type === 'income' ? s + t.convertedAmount : t.type === 'expense' ? s - t.convertedAmount : s, 0), 0);
  return Math.round(net / usable.length);
}

// --- Investment helpers (accounts with type 'investment') ---
// costBasis = money put in (initial balance + net transfers in); balance = current value.
// Gain = balance − costBasis. Kept in the ACCOUNT's currency.
function investmentGain(acc) {
  if (acc.costBasis == null) return null;
  const gain = acc.balance - acc.costBasis;
  const pct = acc.costBasis > 0 ? (gain / acc.costBasis) * 100 : 0;
  return { gain, pct };
}
// Portfolio-level summary in the default currency (skips accounts without a basis).
function investmentSummary() {
  const inv = S.accounts.filter(a => a.type === 'investment' && a.costBasis != null);
  if (!inv.length) return null;
  let basis = 0, value = 0;
  inv.forEach(a => {
    const cb = defaultConvert(a.costBasis, a.currency);
    const cv = defaultConvert(a.balance, a.currency);
    basis += cb.ok ? cb.amount : a.costBasis;
    value += cv.ok ? cv.amount : a.balance;
  });
  const gain = value - basis;
  return { count: inv.length, basis, value, gain, pct: basis > 0 ? (gain / basis) * 100 : 0 };
}

// --- Holdings (individual positions inside an investment account) ---
// h = {id, name, qty (float units), price (cents/unit), avgCost (cents/unit, optional)}.
// When an account has holdings, its balance is DERIVED: Σ qty×price (kept via syncHoldingsValue).
function holdingValue(h) { return Math.round(h.qty * h.price); }
function holdingsValue(acc) { return (acc.holdings||[]).reduce((s,h)=>s+holdingValue(h),0); }
// Per-position gain vs your average buy price (null when avgCost wasn't provided).
function holdingGain(h) {
  if (h.avgCost == null) return null;
  const basis = Math.round(h.qty * h.avgCost);
  const gain = holdingValue(h) - basis;
  return { gain, pct: basis > 0 ? (gain / basis) * 100 : 0 };
}
// Append a point to the account's value history; a second update the same day overwrites
// instead of appending (updating prices twice a day shouldn't spam the chart).
function recordValuePoint(acc, value) {
  acc.valueHistory = acc.valueHistory || [];
  const todayStr = new Date().toISOString().slice(0,10);
  const last = acc.valueHistory[acc.valueHistory.length-1];
  if (last && last.date === todayStr) last.value = value;
  else acc.valueHistory.push({date: todayStr, value});
}
// Re-derive an account's balance from its holdings after any holding/price change.
function syncHoldingsValue(acc) {
  if (!(acc.holdings||[]).length) return;
  const v = holdingsValue(acc);
  acc.balance = v;
  const c = defaultConvert(v, acc.currency);
  acc.convertedBalance = c.ok ? c.amount : v;
  if (acc.costBasis == null) acc.costBasis = v;
  recordValuePoint(acc, v);
}

// --- Wealth sheet (Projection + Portfolio) ---
const WEALTH_MILESTONES = [1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000, 200000000]; // cents
const WEALTH_RATE_SPREAD = 3;   // ± percentage points → the conservative/optimistic band
const WEALTH_INFLATION = 2.5;   // used only for the "today's money" toggle
const WEALTH_HORIZONS = [5, 10, 20, 30];
let _wealthView = 'projection';
let _wealthReal = false; // show the projection in today's (inflation-adjusted) money
function wealthPlan() {
  const p = S.settings.wealthPlan || {};
  return {
    // Default the monthly contribution to what you actually auto-invest, else your avg savings.
    monthly: p.monthly != null ? p.monthly : Math.max(0, monthlyInvestmentContribution() || avgMonthlySavings()),
    rate: p.rate != null ? p.rate : 6,
    years: p.years || 10,
  };
}
// Active recurring-investment schedules (contributions into investment accounts).
function investmentSchedules() { return S.recurringSchedules.filter(s => s.investment); }
// Their combined cost per month in the default currency (cents).
function monthlyInvestmentContribution() {
  return S.recurringSchedules.filter(s => s.active && s.investment).reduce((sum, s) => {
    const c = defaultConvert(s.amount, s.currency);
    return sum + monthlyEquivalent(c.ok ? c.amount : s.amount, s.frequency);
  }, 0);
}
// Set up an automated recurring investment: money moves from a cash account into an investment
// account each period, growing its value and cost basis (handled by generateRecurring).
function openInvestmentContribution() {
  const dc = S.settings.defaultCurrency;
  const invAccts = S.accounts.filter(a => a.type === 'investment');
  const cashAccts = S.accounts.filter(a => a.type !== 'investment');
  const intoOpts = invAccts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('') + `<option value="__new__">+ New investment account…</option>`;
  const fromOpts = cashAccts.length ? cashAccts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('') : `<option value="">(add a cash account first)</option>`;
  openSheet2('inv-contrib', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Recurring investment</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Into</label>
        <select id="ic-into" class="form-input" onchange="document.getElementById('ic-newwrap').style.display=this.value==='__new__'?'block':'none'">${intoOpts}</select></div>
      <div id="ic-newwrap" class="form-field" style="display:${invAccts.length ? 'none' : 'block'}"><label class="form-label">New account name</label>
        <input id="ic-newname" class="form-input" type="text" placeholder="e.g. Index Funds"></div>
      <div class="form-field"><label class="form-label">From</label>
        <select id="ic-from" class="form-input">${fromOpts}</select></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Amount (${getCurInfo(dc).symbol})</label>
          <input id="ic-amt" class="form-input mono" type="text" inputmode="decimal" placeholder="0.00" style="font-size:18px"></div>
        <div class="form-field"><label class="form-label">Every</label>
          <select id="ic-freq" class="form-input"><option value="weekly">Week</option><option value="biweekly">2 weeks</option><option value="monthly" selected>Month</option><option value="yearly">Year</option></select></div>
      </div>
      <div style="font-size:12px;color:var(--text-tertiary);line-height:1.45;margin-bottom:12px">Each period this moves money from your cash account into the investment and raises its cost basis. Update the market value anytime to see gains.</div>
      <button class="btn-primary" onclick="saveInvestmentContribution()">Start investing</button>
    </div>`);
}
function saveInvestmentContribution() {
  const dc = S.settings.defaultCurrency;
  const into = document.getElementById('ic-into')?.value;
  let acc;
  if (into === '__new__') {
    const name = (document.getElementById('ic-newname')?.value || '').trim();
    if (!name) { showToast('Name the account', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    acc = { id: gid(), name, type: 'investment', balance: 0, currency: dc, convertedBalance: 0, costBasis: 0, valueHistory: [{ date: today, value: 0 }] };
    S.accounts.push(acc);
  } else {
    acc = S.accounts.find(a => a.id === into);
  }
  const from = document.getElementById('ic-from')?.value;
  const amt = parseAmount(document.getElementById('ic-amt')?.value);
  const freq = document.getElementById('ic-freq')?.value || 'monthly';
  if (!acc) { showToast('Pick an account', 'error'); return; }
  if (!from) { showToast('Choose where the money comes from', 'error'); return; }
  if (isNaN(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const cents = Math.round(amt * 100);
  S.recurringSchedules.push({
    id: gid(), type: 'transfer', amount: cents, currency: dc, convertedAmount: cents, exchangeRate: 1,
    category: 'savings', merchant: `Investment → ${acc.name}`, accountId: from, toAccountId: acc.id,
    frequency: freq, startDate: new Date().toISOString().slice(0, 10), active: true, investment: true, note: 'Recurring investment'
  });
  generateRecurring();
  saveState(); closeTopSheet2(); renderCurrentTab();
  showToast(`Investing ${formatCurrency(cents, dc)} / ${freq.replace('ly','')} → ${acc.name}`, 'success');
}
// Renders into the dedicated Wealth tab (was previously a sheet off the dashboard teaser).
function renderWealth() {
  const el = document.getElementById('tab-wealth'); if (!el) return;
  el.innerHTML = `
    <div class="wealth-wrap">
      <div class="seg has-ind" id="wealth-seg" style="--seg-n:2;margin-bottom:16px">
        <div class="seg-ind" style="transform:translateX(${_wealthView === 'portfolio' ? 100 : 0}%)"></div>
        <button class="seg-btn${_wealthView === 'projection' ? ' active' : ''}" onclick="setWealthView('projection')">Projection</button>
        <button class="seg-btn${_wealthView === 'portfolio' ? ' active' : ''}" onclick="setWealthView('portfolio')">Portfolio</button>
      </div>
      <div id="wealth-content"></div>
    </div>`;
  renderWealthContent();
  maybeAutoRefreshPrices();
}
function setWealthView(v) {
  _wealthView = v;
  const ind = document.querySelector('#wealth-seg .seg-ind');
  if (ind) ind.style.transform = `translateX(${v === 'portfolio' ? 100 : 0}%)`;
  document.querySelectorAll('#wealth-seg .seg-btn').forEach((b, i) => b.classList.toggle('active', i === (v === 'portfolio' ? 1 : 0)));
  renderWealthContent();
}
function renderWealthContent() {
  const el = document.getElementById('wealth-content'); if (!el) return;
  if (_wealthView === 'portfolio') { el.innerHTML = portfolioHTML(); requestAnimationFrame(drawPortfolio); }
  else { el.innerHTML = projectionHTML(); requestAnimationFrame(drawProjection); }
}
function projectionHTML() {
  const plan = wealthPlan();
  const dc = S.settings.defaultCurrency;
  const horizonBtns = WEALTH_HORIZONS.map(y =>
    `<button class="seg-btn${plan.years === y ? ' active' : ''}" data-years="${y}" onclick="setWealthYears(${y})">${y}y</button>`).join('');
  return `
    <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
      From your net worth of <strong>${formatCurrency(netWorthNow(), dc)}</strong>, here's where steady investing could take you. The shaded band is the range if returns run lower or higher than expected.
    </div>
    <div class="form-row">
      <div class="form-field"><label class="form-label">Adding / month</label>
        <input id="wealth-monthly" class="form-input mono" type="text" inputmode="decimal" value="${(plan.monthly / 100).toFixed(0)}" oninput="drawProjection()"></div>
      <div class="form-field"><label class="form-label">Return / year %</label>
        <input id="wealth-rate" class="form-input mono" type="text" inputmode="decimal" value="${plan.rate}" oninput="drawProjection()"></div>
    </div>
    <div class="seg has-ind" id="wealth-horizon" style="--seg-n:4;margin-bottom:14px">
      <div class="seg-ind" style="transform:translateX(${WEALTH_HORIZONS.indexOf(plan.years) * 100}%)"></div>${horizonBtns}</div>
    <div class="wealth-headline" id="wealth-headline"></div>
    <div style="background:var(--bg-elevated);border-radius:var(--radius);padding:12px 10px 6px;margin:12px 0"><div style="height:190px"><canvas id="wealth-chart"></canvas></div></div>
    <div style="display:flex;justify-content:center;margin-bottom:10px">
      <button class="wealth-toggle${_wealthReal ? ' on' : ''}" onclick="toggleWealthReal()">Show in today's money</button>
    </div>
    <div id="wealth-milestones"></div>
    <div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;margin-top:12px">A projection, not a promise. The band assumes returns average <span id="wealth-lowhigh">3–9</span>%/yr; “today's money” discounts for ~${WEALTH_INFLATION}% inflation. World stock indexes have averaged ~7% before inflation.</div>`;
}
function setWealthYears(y) {
  S.settings.wealthPlan = { ...wealthPlan(), years: y }; saveState();
  const ind = document.querySelector('#wealth-horizon .seg-ind');
  if (ind) ind.style.transform = `translateX(${WEALTH_HORIZONS.indexOf(y) * 100}%)`;
  document.querySelectorAll('#wealth-horizon .seg-btn').forEach(b => b.classList.toggle('active', +b.dataset.years === y));
  drawProjection();
}
function toggleWealthReal() {
  _wealthReal = !_wealthReal;
  const b = document.querySelector('.wealth-toggle'); if (b) b.classList.toggle('on', _wealthReal);
  drawProjection();
}
// Re-read inputs, persist, redraw the scenario band + headline + milestones.
function drawProjection() {
  const mEl = document.getElementById('wealth-monthly'), rEl = document.getElementById('wealth-rate');
  if (!mEl) return;
  const dc = S.settings.defaultCurrency;
  const monthly = Math.round((parseAmount(mEl.value) || 0) * 100);
  const rate = Math.min(30, Math.max(-5, parseAmount(rEl.value) || 0));
  const years = (S.settings.wealthPlan && S.settings.wealthPlan.years) || wealthPlan().years;
  S.settings.wealthPlan = { monthly, rate, years }; saveState();
  const start = netWorthNow(), months = years * 12;
  const lowRate = Math.max(0, rate - WEALTH_RATE_SPREAD), highRate = rate + WEALTH_RATE_SPREAD;
  const gExp = projectWealth(start, monthly, rate, months);
  const gLow = projectWealth(start, monthly, lowRate, months);
  const gHigh = projectWealth(start, monthly, highRate, months);
  const gCon = projectWealth(start, monthly, 0, months);
  const yi = []; for (let y = 0; y <= years; y++) yi.push(y * 12);
  const disc = (v, mi) => _wealthReal ? Math.round(v / Math.pow(1 + WEALTH_INFLATION / 100, mi / 12)) : v;
  const low = yi.map(i => disc(gLow[i], i)), high = yi.map(i => disc(gHigh[i], i)),
        exp = yi.map(i => disc(gExp[i], i)), con = yi.map(i => disc(gCon[i], i));
  const finalExp = exp[exp.length - 1], finalLow = low[low.length - 1], finalHigh = high[high.length - 1];
  const contributed = con[con.length - 1], growthPart = finalExp - contributed;
  document.getElementById('wealth-headline').innerHTML =
    `<div class="wealth-headline-amt">${formatCurrency(finalExp, dc, true)}</div>
     <div class="wealth-headline-sub">expected in ${years} years · range ${formatCurrency(finalLow, dc, true)}–${formatCurrency(finalHigh, dc, true)}${_wealthReal ? " · today's money" : ''}</div>
     <div class="wealth-headline-split">${formatCurrency(Math.max(0, contributed), dc, true)} put in + ${formatCurrency(Math.max(0, growthPart), dc, true)} growth</div>`;
  const lh = document.getElementById('wealth-lowhigh'); if (lh) lh.textContent = `${lowRate.toFixed(0)}–${highRate.toFixed(0)}`;
  // Upcoming milestones (based on the expected, nominal path).
  const upcoming = WEALTH_MILESTONES.filter(t => t > start).slice(0, 3);
  const rows = upcoming.map(t => {
    const m = monthsToReach(t, start, monthly, rate);
    const when = m == null ? 'beyond 50y' : m <= 12 ? `~${m} mo` : `~${(m / 12).toFixed(m < 60 ? 1 : 0)} yr`;
    const reached = m != null && m <= months;
    return `<div class="wealth-ms-row">
      <span style="font-size:17px">${reached ? '🏁' : '🔭'}</span>
      <span style="font-weight:600;font-family:'JetBrains Mono',monospace">${formatCurrency(t, dc, true)}</span>
      <span style="margin-left:auto;font-size:13px;color:${reached ? 'var(--green)' : 'var(--text-tertiary)'}">${when}</span>
    </div>`;
  }).join('');
  document.getElementById('wealth-milestones').innerHTML = rows ? `<div class="section-label">Milestones</div>${rows}` : '';
  // Chart last — it's decorative, so a chart-lib hiccup never blocks the numbers above.
  const nowYear = new Date().getFullYear();
  mkProjectionChart('wealth-chart', yi.map(i => String(nowYear + i / 12)), { low, high, exp, con });
}
// Scenario band: shaded area between the conservative and optimistic paths, expected line on top,
// contributions-only dashed for reference.
function mkProjectionChart(canvasId, labels, s) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const dc = S.settings.defaultCurrency, cc = chartColors();
  _charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Low',  data: s.low,  borderColor: 'rgba(240,180,41,0)', pointRadius: 0, fill: false, tension: .3 },
      { label: 'High', data: s.high, borderColor: 'rgba(240,180,41,0)', backgroundColor: 'rgba(240,180,41,.13)', pointRadius: 0, fill: 0, tension: .3 },
      { label: 'Expected', data: s.exp, borderColor: '#F0B429', borderWidth: 2.5, pointRadius: 0, fill: false, tension: .3 },
      { label: 'Contributions', data: s.con, borderColor: cc.text3, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: .1 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false },
        tooltip: { callbacks: {
          title: items => { const y = Math.round(parseFloat(items[0].label) - new Date().getFullYear()); return `In ${y} year${y !== 1 ? 's' : ''}`; },
          label: ctx => (ctx.dataset.label === 'Low' || ctx.dataset.label === 'High') ? null : ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw, dc)}` } } },
      scales: {
        x: { grid: { color: cc.gridLine }, ticks: { color: cc.text3, maxTicksLimit: 6, callback: function (v) { return Math.round(parseFloat(this.getLabelForValue(v))); } } },
        y: { grid: { color: cc.gridLine }, ticks: { color: cc.text3, callback: v => formatCurrency(v, dc, true) } } } }
  });
}
// --- Portfolio view ---
function portfolioHTML() {
  const dc = S.settings.defaultCurrency;
  const inv = investmentSummary();
  if (!inv) {
    return `<div class="empty-state" style="padding:28px 16px">
      <div style="font-size:40px;margin-bottom:12px">📈</div>
      <div class="empty-state-title">No investments tracked yet</div>
      <div class="empty-state-desc">Track an investment account's value, gains and allocation here — or automate a recurring contribution. It also feeds your projection.</div>
      <button class="empty-state-btn" onclick="openInvestmentContribution()">Set up recurring investment</button>
      <div style="height:10px"></div>
      <button class="btn-secondary" onclick="openAddAccountSheet({type:'investment'})">Add investment account</button>
    </div>`;
  }
  const invAccts = S.accounts.filter(a => a.type === 'investment');
  // Recurring-investment schedules block.
  const schs = investmentSchedules();
  const recurHTML = `
    <div class="section-label" style="margin-top:16px">Recurring investments</div>
    ${schs.length ? schs.map(s => {
      const target = S.accounts.find(a => a.id === s.toAccountId);
      return `<div class="port-row" onclick="openEditRecurringSheet('${s.id}')">
        <div class="port-dot" style="background:${s.active ? 'var(--green)' : 'var(--text-tertiary)'}"></div>
        <div style="flex:1;min-width:0"><div class="port-name">→ ${escHtml(target ? target.name : 'Investment')}</div><div class="port-gain" style="color:var(--text-tertiary)">${s.frequency}${s.active ? '' : ' · paused'}</div></div>
        <div class="port-val">${formatCurrency(s.amount, s.currency)}</div>
      </div>`;
    }).join('') : `<div style="font-size:12.5px;color:var(--text-secondary);padding:2px 4px 8px">Automate a contribution so investing happens on its own.</div>`}
    <button class="add-acc-btn" style="margin:8px 0 0" onclick="openInvestmentContribution()">+ ${schs.length ? 'Add another' : 'Automate an investment'}</button>`;
  const rows = invAccts.map(a => {
    const cv = defaultConvert(a.balance, a.currency); const val = cv.ok ? cv.amount : a.balance;
    const g = investmentGain(a);
    return `<div class="port-row" onclick="openAccDetail('${a.id}')">
      <div class="port-dot" style="background:${a.color || '#58A6FF'}"></div>
      <div style="flex:1;min-width:0"><div class="port-name">${escHtml(a.name)}</div>${g ? `<div class="port-gain" style="color:${g.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${g.gain >= 0 ? '▲' : '▼'} ${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(1)}%</div>` : ''}</div>
      <div class="port-val">${formatCurrency(val, dc)}</div>
    </div>`;
  }).join('');
  return `
    <div class="port-summary">
      <div><div class="port-sum-lbl">Invested</div><div class="port-sum-val">${formatCurrency(inv.basis, dc, true)}</div></div>
      <div><div class="port-sum-lbl">Value</div><div class="port-sum-val">${formatCurrency(inv.value, dc, true)}</div></div>
      <div><div class="port-sum-lbl">Gain</div><div class="port-sum-val" style="color:${inv.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${inv.gain >= 0 ? '+' : ''}${formatCurrency(inv.gain, dc, true)}</div></div>
    </div>
    <div class="port-gainpct" style="color:${inv.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${inv.gain >= 0 ? '+' : ''}${inv.pct.toFixed(1)}% all-time</div>
    ${hasLiveHoldings() ? `<div class="price-refresh-row">
      <span class="price-ago">${S.settings.lastPriceRefresh ? 'Prices ' + priceAgo(S.settings.lastPriceRefresh) : 'Tap to fetch live prices'}</span>
      <button class="wealth-toggle" onclick="refreshHoldingPrices()">↻ Refresh</button>
      <button class="price-auto${S.settings.autoRefreshPrices !== false ? ' on' : ''}" onclick="toggleAutoRefresh()" title="Auto-refresh when you open Wealth (max once / 6h)">Auto</button>
    </div>` : ''}
    ${invAccts.length > 1 ? `<div class="donut-wrap" style="margin:6px auto 2px"><canvas id="port-donut"></canvas><div class="donut-center"><div class="donut-center-lbl">Value</div><div class="donut-center-amt">${formatCurrency(inv.value, dc, true)}</div></div></div>` : ''}
    <div class="section-label" style="margin-top:10px">Accounts</div>
    ${rows}
    ${recurHTML}
    <div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;margin-top:14px">Gains compare each account's current value to what you put in (its cost basis). Update values or individual holdings from the account screen.</div>`;
}
function drawPortfolio() {
  const invAccts = S.accounts.filter(a => a.type === 'investment');
  if (invAccts.length > 1 && document.getElementById('port-donut')) {
    const labels = invAccts.map(a => a.name);
    const data = invAccts.map(a => { const c = defaultConvert(a.balance, a.currency); return c.ok ? c.amount : a.balance; });
    const palette = ['#58A6FF', '#3FB950', '#F0B429', '#A29BFE', '#FF6B6B', '#4ECDC4', '#FD79A8', '#FF9F43'];
    const colors = invAccts.map((a, i) => a.color || palette[i % palette.length]);
    mkDonut('port-donut', labels, data, colors);
  }
}

// ===== Live prices (opt-in, user-initiated) =====
// Crypto quotes: CoinGecko markets-by-symbol (keyless, CORS-enabled). Stock/ETF quotes: Finnhub
// (free API key the user pastes, stored on-device). Nothing is fetched unless the user taps Refresh.
let _pricesBusy = false;
// Any tickered, auto-priceable holdings across investment accounts?
function hasLiveHoldings(accId) {
  const accts = accId ? [S.accounts.find(a => a.id === accId)] : S.accounts.filter(a => a.type === 'investment');
  return accts.some(a => (a?.holdings || []).some(h => h.ticker && h.assetType));
}
async function fetchCryptoPrices(symbols, vs) {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${encodeURIComponent(vs.toLowerCase())}&symbols=${encodeURIComponent(symbols.join(',').toLowerCase())}&per_page=250&page=1`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('CoinGecko ' + res.status);
  const arr = await res.json();
  const map = {};
  (arr || []).forEach(c => { if (c.symbol != null && c.current_price != null) map[String(c.symbol).toUpperCase()] = c.current_price; });
  return map;
}
async function fetchStockQuote(symbol, key) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`);
  if (res.status === 401 || res.status === 403) throw new Error('Bad API key');
  if (!res.ok) throw new Error('Finnhub ' + res.status);
  const j = await res.json();
  if (j.c == null || j.c === 0) throw new Error('No quote for ' + symbol);
  return j.c; // current price, assumed in the account's currency
}
// "updated 5m ago" style freshness label.
function priceAgo(ts) {
  if (!ts) return null;
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : `${d}d ago`;
}
// `silent` (auto-refresh) suppresses the progress/result toasts and the key prompt.
async function refreshHoldingPrices(accId, silent) {
  if (_pricesBusy) return;
  const accts = accId ? [S.accounts.find(a => a.id === accId)] : S.accounts.filter(a => a.type === 'investment');
  const items = [];
  accts.forEach(a => (a?.holdings || []).forEach(h => { if (h.ticker && h.assetType) items.push({ acc: a, h }); }));
  if (!items.length) { if (!silent) showToast('Add a ticker + type to a holding first', 'info'); return; }
  const needStock = items.some(t => t.h.assetType === 'stock');
  if (needStock && !S.settings.stockApiKey) { if (!silent) openStockKeySheet(accId); return; }
  _pricesBusy = true; if (!silent) showToast('Updating prices…', 'info');
  let ok = 0, fail = 0;
  try {
    const cryptoByCur = {};
    items.filter(t => t.h.assetType === 'crypto').forEach(t => { (cryptoByCur[t.acc.currency] = cryptoByCur[t.acc.currency] || []).push(t); });
    for (const cur of Object.keys(cryptoByCur)) {
      const group = cryptoByCur[cur];
      try {
        const map = await fetchCryptoPrices([...new Set(group.map(t => t.h.ticker))], cur);
        group.forEach(t => { const p = map[t.h.ticker.toUpperCase()]; if (p != null) { t.h.price = Math.round(p * 100); ok++; } else fail++; });
      } catch (e) { fail += group.length; }
    }
    for (const t of items.filter(t => t.h.assetType === 'stock')) {
      try { const p = await fetchStockQuote(t.h.ticker, S.settings.stockApiKey); t.h.price = Math.round(p * 100); ok++; }
      catch (e) { fail++; if (String(e.message).includes('API key')) { if (!silent) showToast('Stock API key rejected', 'error'); break; } }
    }
    [...new Set(items.map(t => t.acc))].forEach(a => syncHoldingsValue(a));
    if (ok) S.settings.lastPriceRefresh = Date.now();
    saveState(); renderCurrentTab();
    if (!silent) {
      if (ok) showToast(`Updated ${ok} price${ok !== 1 ? 's' : ''}${fail ? ` · ${fail} failed` : ''}`, fail ? 'warning' : 'success');
      else showToast('Could not fetch prices — check tickers / connection', 'error');
    }
  } catch (e) {
    if (!silent) showToast('Price update failed', 'error');
  } finally { _pricesBusy = false; }
}
// Auto-refresh when opening the Wealth tab: at most once every 6h, only if enabled, there are
// tickered holdings, and no missing stock key (auto never prompts). Failures are silent.
function maybeAutoRefreshPrices() {
  if (S.settings.autoRefreshPrices === false) return;
  if (!hasLiveHoldings()) return;
  const last = S.settings.lastPriceRefresh || 0;
  if (Date.now() - last < 6 * 3600 * 1000) return;
  const needStock = S.accounts.some(a => a.type === 'investment' && (a.holdings || []).some(h => h.assetType === 'stock' && h.ticker));
  if (needStock && !S.settings.stockApiKey) return; // don't prompt on auto
  refreshHoldingPrices(null, true);
}
function toggleAutoRefresh() {
  S.settings.autoRefreshPrices = S.settings.autoRefreshPrices === false ? true : false;
  saveState(); renderCurrentTab();
  showToast(S.settings.autoRefreshPrices === false ? 'Auto-refresh off' : 'Auto-refresh on', 'success');
}
function openStockKeySheet(accId) {
  openSheet2('stock-key', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Stock price API key</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">Stock &amp; ETF quotes come from <strong>Finnhub</strong>. Create a free key at <strong>finnhub.io</strong> (a minute, no card), then paste it here. It's stored only on this device and sent only to Finnhub when you refresh.</div>
      <div class="form-field"><label class="form-label">Finnhub API key</label>
        <input id="stock-key-input" class="form-input" type="text" placeholder="paste your key" autocomplete="off" value="${escHtml(S.settings.stockApiKey || '')}"></div>
      <button class="btn-primary" onclick="saveStockKey('${accId || ''}')">Save &amp; refresh</button>
      ${S.settings.stockApiKey ? `<button class="btn-secondary" style="width:100%;margin-top:10px" onclick="S.settings.stockApiKey='';saveState();closeTopSheet2();showToast('Key removed','success')">Remove key</button>` : ''}
    </div>`);
}
function saveStockKey(accId) {
  const k = (document.getElementById('stock-key-input')?.value || '').trim();
  if (!k) { showToast('Paste a key', 'error'); return; }
  S.settings.stockApiKey = k; saveState(); closeTopSheet2();
  refreshHoldingPrices(accId || null);
}

// Compact dashboard strip: one number that makes the future concrete, tap for the full sheet.
function wealthTeaserHTML() {
  if (!S.accounts.length) return '';
  const plan = wealthPlan();
  const dc = S.settings.defaultCurrency;
  const grown = projectWealth(netWorthNow(), plan.monthly, plan.rate, plan.years * 12);
  return `<div class="velocity-strip vel-green" onclick="switchTab('wealth')" style="cursor:pointer">
    🔮 At ${formatCurrency(plan.monthly, dc, true)}/mo → ~${formatCurrency(grown[grown.length - 1], dc, true)} in ${plan.years} years · plan it →
  </div>`;
}
