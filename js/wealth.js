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
// Record today's net worth into a rolling history (deduped per day) so the trend builds over time.
function recordNetWorthSnapshot() {
  if (!S.accounts || !S.accounts.length) return;
  S.netWorthHistory = S.netWorthHistory || [];
  const today = new Date().toISOString().slice(0, 10);
  const v = netWorthNow();
  const last = S.netWorthHistory[S.netWorthHistory.length - 1];
  if (last && last.date === today) last.value = v;
  else S.netWorthHistory.push({ date: today, value: v });
  if (S.netWorthHistory.length > 800) S.netWorthHistory = S.netWorthHistory.slice(-800);
}
// A monthly net-worth series for the last `months`. Uses recorded snapshots where they exist and,
// for months before the app started tracking, estimates backward from income/spending flows
// (transfers net out; investment market moves aren't captured — hence "estimated").
function netWorthSeries(months = 12) {
  const flowIn = key => S.transactions.filter(t => t.date.startsWith(key))
    .reduce((s, t) => t.type === 'income' ? s + t.convertedAmount : t.type === 'expense' ? s - t.convertedAmount : s, 0);
  const snaps = {};
  (S.netWorthHistory || []).forEach(p => { snaps[p.date.slice(0, 7)] = p.value; }); // last snapshot wins per month
  const now = new Date();
  let running = netWorthNow();
  const out = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const val = snaps[key] != null ? snaps[key] : running;
    out.unshift({ month: key, value: val });
    running = val - flowIn(key); // → net worth at the end of the previous month
  }
  return out;
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
// Every position across every investment account, flattened — what Trading212 calls a "pie".
function allHoldings() {
  const out = [];
  S.accounts.filter(a => a.type === 'investment').forEach(a => (a.holdings || []).forEach(h => out.push({ acc: a, h })));
  return out;
}
// Quantities are derived (amount ÷ price) so they're rarely round numbers — nobody buys
// "14.285714285714286 shares". Show a clean, human quantity instead of the raw float.
function fmtQty(q) {
  if (q == null || isNaN(q)) return '';
  if (Math.abs(q - Math.round(q)) < 1e-9) return String(Math.round(q));
  let s = q.toFixed(q < 1 ? 6 : 4);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
// Stable color per position (by ticker/name) so the same asset keeps its color everywhere —
// the holdings list, the allocation pie, and any future chart.
const HOLD_PALETTE = ['#58A6FF', '#3FB950', '#F0B429', '#A29BFE', '#FF6B6B', '#4ECDC4', '#FD79A8', '#FF9F43'];
function holdColor(h) {
  const s = h.ticker || h.name || '';
  let hash = 0; for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return HOLD_PALETTE[Math.abs(hash) % HOLD_PALETTE.length];
}
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
  renderWealthContent(); // triggers throttled auto-refresh itself
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
  maybeAutoRefreshPrices(); // auto-update quotes on view open (throttled), no button needed
}
// Actual net-worth trend card (past) — sits above the projection (future).
function nwHistoryCardHTML() {
  const series = netWorthSeries(12);
  if (series.length < 2) return '';
  const dc = S.settings.defaultCurrency;
  const first = series[0].value, last = series[series.length - 1].value;
  const chg = last - first, pct = first ? (chg / Math.abs(first) * 100) : 0;
  return `<div style="background:var(--bg-elevated);border-radius:var(--radius);padding:12px 12px 6px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 4px">
      <span class="section-label" style="margin:0">Net worth · last 12 mo</span>
      <span style="font-size:12.5px;font-weight:600;color:${chg >= 0 ? 'var(--green)' : 'var(--red)'}">${chg >= 0 ? '▲' : '▼'} ${formatCurrency(Math.abs(chg), dc, true)} (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)</span>
    </div>
    <div style="height:120px"><canvas id="nw-history-chart"></canvas></div>
    <div style="font-size:10.5px;color:var(--text-tertiary);padding:2px 2px 0">Estimated from your income &amp; spending history; refines as the app records daily snapshots.</div>
  </div>`;
}
function drawNetWorthHistory() {
  const series = netWorthSeries(12);
  if (series.length < 2 || !document.getElementById('nw-history-chart')) return;
  const labels = series.map(p => { const [y, m] = p.month.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString(undefined, { month: 'short' }); });
  mkLine('nw-history-chart', labels, [{ label: 'Net worth', data: series.map(p => p.value), borderColor: '#3FB950', backgroundColor: 'rgba(63,185,80,.12)', fill: true, pointRadius: 0, tension: .3, borderWidth: 2 }]);
}
function projectionHTML() {
  const plan = wealthPlan();
  const dc = S.settings.defaultCurrency;
  const horizonBtns = WEALTH_HORIZONS.map(y =>
    `<button class="seg-btn${plan.years === y ? ' active' : ''}" data-years="${y}" onclick="setWealthYears(${y})">${y}y</button>`).join('');
  return `
    ${nwHistoryCardHTML()}
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
  // Charts last — decorative, so a chart-lib hiccup never blocks the numbers above.
  drawNetWorthHistory();
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
      <div class="empty-state-title">Track your investments</div>
      <div class="empty-state-desc">Search a stock, ETF or coin, enter how much you hold, and its value updates live. It also feeds your projection below.</div>
      <button class="empty-state-btn" onclick="openHoldingSheet()">+ Add investment</button>
      <div style="height:10px"></div>
      <button class="btn-secondary" onclick="openInvestmentContribution()">Automate a monthly contribution</button>
    </div>`;
  }
  const invAccts = S.accounts.filter(a => a.type === 'investment');
  // Recurring-investment schedules block.
  const schs = investmentSchedules();
  const recurHTML = `
    <div class="section-label" style="margin-top:16px">Automatic contributions</div>
    ${schs.length ? schs.map(s => {
      const target = S.accounts.find(a => a.id === s.toAccountId);
      return `<div class="port-row" onclick="openEditRecurringSheet('${s.id}')">
        <div class="port-dot" style="background:${s.active ? 'var(--green)' : 'var(--text-tertiary)'}"></div>
        <div style="flex:1;min-width:0"><div class="port-name">→ ${escHtml(target ? target.name : 'Investment')}</div><div class="port-gain" style="color:var(--text-tertiary)">${s.frequency}${s.active ? '' : ' · paused'}</div></div>
        <div class="port-val">${formatCurrency(s.amount, s.currency)}</div>
      </div>`;
    }).join('') : `<div style="font-size:12.5px;color:var(--text-secondary);padding:2px 4px 8px">Automate a contribution so investing happens on its own.</div>`}
    <button class="add-acc-btn" style="margin:8px 0 0" onclick="openInvestmentContribution()">+ ${schs.length ? 'Add another' : 'Automate an investment'}</button>`;
  // What you actually own — every position, across every investment account, one flat list
  // (Trading212-style "pie"), instead of making you drill into each account to see it.
  const holdings = allHoldings();
  const allocRows = holdings.map(({ acc, h }) => {
    const c = defaultConvert(holdingValue(h), acc.currency);
    return { key: h.ticker || h.name, color: holdColor(h), value: c.ok ? c.amount : holdingValue(h) };
  }).sort((a, b) => b.value - a.value);
  const totalAlloc = allocRows.reduce((s, r) => s + r.value, 0);
  const allocHTML = allocRows.length > 1 ? `
    <div class="donut-wrap" style="margin:10px auto 0"><canvas id="port-donut"></canvas><div class="donut-center"><div class="donut-center-lbl">Value</div><div class="donut-center-amt">${formatCurrency(inv.value, dc, true)}</div></div></div>
    <div class="alloc-legend">
      ${allocRows.slice(0, 8).map(r => `<div class="alloc-row"><span class="alloc-dot" style="background:${r.color}"></span><span class="alloc-name">${escHtml(r.key)}</span><span class="alloc-pct">${totalAlloc ? ((r.value / totalAlloc) * 100).toFixed(1) : '0.0'}%</span></div>`).join('')}
      ${allocRows.length > 8 ? `<div class="alloc-more">+${allocRows.length - 8} more</div>` : ''}
    </div>` : '';
  const holdRows = holdings.map(({ acc, h }) => {
    const hg = holdingGain(h);
    const c = defaultConvert(holdingValue(h), acc.currency);
    const val = c.ok ? c.amount : holdingValue(h);
    const initial = (h.ticker || h.name || '?').trim().slice(0, 1).toUpperCase();
    return `<div class="port-row" onclick="openHoldingSheet('${acc.id}','${h.id}')">
      <div class="hold-icon" style="background:${holdColor(h)}">${escHtml(initial)}</div>
      <div style="flex:1;min-width:0"><div class="port-name">${escHtml(h.name)}</div><div class="port-gain" style="color:var(--text-tertiary)">${h.ticker ? escHtml(h.ticker) : 'Manual'}${invAccts.length > 1 ? ` · ${escHtml(acc.name)}` : ''}</div></div>
      <div style="text-align:right"><div class="port-val">${formatCurrency(val, dc)}</div>${hg ? `<div class="port-gain" style="color:${hg.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${hg.gain >= 0 ? '+' : ''}${hg.pct.toFixed(1)}%</div>` : ''}</div>
    </div>`;
  }).join('');
  // Accounts only get their own section when there's more than one to tell apart — with a
  // single account it's the same total as above, just noise.
  const accRows = invAccts.length > 1 ? invAccts.map(a => {
    const cv = defaultConvert(a.balance, a.currency); const val = cv.ok ? cv.amount : a.balance;
    const g = investmentGain(a);
    return `<div class="port-row" onclick="openAccDetail('${a.id}')">
      <div class="port-dot" style="background:${a.color || '#58A6FF'}"></div>
      <div style="flex:1;min-width:0"><div class="port-name">${escHtml(a.name)}</div>${g ? `<div class="port-gain" style="color:${g.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${g.gain >= 0 ? '▲' : '▼'} ${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(1)}%</div>` : ''}</div>
      <div class="port-val">${formatCurrency(val, dc)}</div>
    </div>`;
  }).join('') : '';
  return `
    <div class="port-summary">
      <div><div class="port-sum-lbl">Invested</div><div class="port-sum-val">${formatCurrency(inv.basis, dc, true)}</div></div>
      <div><div class="port-sum-lbl">Value</div><div class="port-sum-val">${formatCurrency(inv.value, dc, true)}</div></div>
      <div><div class="port-sum-lbl">Gain</div><div class="port-sum-val" style="color:${inv.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${inv.gain >= 0 ? '+' : ''}${formatCurrency(inv.gain, dc, true)}</div></div>
    </div>
    <div class="port-gainpct" style="color:${inv.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${inv.gain >= 0 ? '+' : ''}${inv.pct.toFixed(1)}% all-time</div>
    ${hasLiveHoldings() ? `<div class="price-refresh-row">
      <span class="price-ago">${S.settings.autoRefreshPrices === false ? 'Auto-update off' : '⟳ Auto-updating'}${S.settings.lastPriceRefresh ? ' · ' + priceAgo(S.settings.lastPriceRefresh) : ''}</span>
      <button class="price-refresh-now" onclick="refreshHoldingPrices()" title="Refresh now">↻</button>
      <button class="price-auto${S.settings.autoRefreshPrices !== false ? ' on' : ''}" onclick="toggleAutoRefresh()" title="Toggle automatic updates">${S.settings.autoRefreshPrices === false ? 'Off' : 'Auto'}</button>
    </div>` : ''}
    ${allocHTML}
    <button class="btn-primary" style="margin:14px 0 4px" onclick="openHoldingSheet()">+ Add investment</button>
    ${holdRows ? `<div class="section-label" style="margin-top:14px">Holdings</div>${holdRows}` : ''}
    ${accRows ? `<div class="section-label" style="margin-top:14px">Accounts</div>${accRows}` : ''}
    ${recurHTML}
    <div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;margin-top:14px">“Add investment” tracks a fund you own (live). “Automatic contributions” schedule cash into an account on a repeat. Gains compare current value to what you put in.</div>`;
}
function drawPortfolio() {
  const holdings = allHoldings();
  if (holdings.length > 1 && document.getElementById('port-donut')) {
    const rows = holdings.map(({ acc, h }) => {
      const c = defaultConvert(holdingValue(h), acc.currency);
      return { label: h.ticker || h.name, value: c.ok ? c.amount : holdingValue(h), color: holdColor(h) };
    }).sort((a, b) => b.value - a.value);
    mkDonut('port-donut', rows.map(r => r.label), rows.map(r => r.value), rows.map(r => r.color));
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
// --- Price proxy (Cloudflare Worker, see tools/price-proxy-worker.js) ---
function proxyBase() { return (S.settings.priceProxyUrl || '').replace(/\/+$/, ''); }
// A stock source is available if the proxy is configured OR a Finnhub key is set.
function stockSourceReady() { return !!(proxyBase() || S.settings.stockApiKey); }
let _fxMemo = {}; // per-refresh cache of fetched FX rates
async function fxRate(from, to) {
  from = String(from).toUpperCase(); to = String(to).toUpperCase();
  if (from === to) return 1;
  const key = from + '_' + to;
  if (_fxMemo[key] != null) return _fxMemo[key];
  if (proxyBase()) {
    try {
      const r = await fetch(`${proxyBase()}/fx?from=${from}&to=${to}`);
      if (r.ok) { const j = await r.json(); if (j.rate != null) { _fxMemo[key] = j.rate; S.exchangeRates[key] = j.rate; return j.rate; } }
    } catch (e) {}
  }
  const stored = getRate(from, to); // fall back to any user-entered rate
  return stored != null ? stored : null;
}
// Current price for a stock/ETF ticker, converted into the account's currency. Prefers the proxy
// (Yahoo, keyless, international + gives the quote's native currency for FX); falls back to Finnhub.
async function fetchStockPrice(ticker, accountCur) {
  if (proxyBase()) {
    const r = await fetch(`${proxyBase()}/quote?symbol=${encodeURIComponent(ticker)}`);
    if (!r.ok) throw new Error('proxy ' + r.status);
    const d = await r.json();
    if (d.price == null) throw new Error('No quote for ' + ticker);
    let price = d.price;
    const cur = String(d.currency || accountCur).toUpperCase();
    if (cur !== String(accountCur).toUpperCase()) {
      const fx = await fxRate(cur, accountCur);
      if (fx != null) price *= fx; else throw new Error('No FX ' + cur + '→' + accountCur);
    }
    return price;
  }
  if (S.settings.stockApiKey) return await fetchStockQuote(ticker, S.settings.stockApiKey); // assumed already in account currency
  throw new Error('No stock source');
}
// Live symbol search across crypto (CoinGecko, keyless) and stocks/ETFs (Finnhub, needs key).
// Returns [{name, ticker, assetType, cgId?}]. Sources fail independently (offline → [] for that one).
async function searchSymbols(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const out = [];
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
    if (r.ok) { const j = await r.json(); (j.coins || []).slice(0, 6).forEach(c => out.push({ name: c.name, ticker: String(c.symbol).toUpperCase(), assetType: 'crypto', cgId: c.id })); }
  } catch (e) {}
  if (proxyBase()) {
    try {
      const r = await fetch(`${proxyBase()}/search?q=${encodeURIComponent(q)}`);
      if (r.ok) { const j = await r.json(); (j.results || []).slice(0, 12).forEach(x => out.push({ name: x.name, ticker: x.symbol, assetType: 'stock', exchange: x.exchange })); }
    } catch (e) {}
  } else if (S.settings.stockApiKey) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(S.settings.stockApiKey)}`);
      if (r.ok) { const j = await r.json(); (j.result || []).slice(0, 10).forEach(x => out.push({ name: x.description || x.symbol, ticker: x.symbol, assetType: 'stock' })); }
    } catch (e) {}
  }
  return out;
}
// Fetch the current price for a chosen search result, in the given currency.
async function fetchSelectedPrice(sel, cur) {
  if (sel.assetType === 'crypto') {
    if (sel.cgId) {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(sel.cgId)}&vs_currencies=${encodeURIComponent(cur.toLowerCase())}`);
      if (r.ok) { const j = await r.json(); const p = j[sel.cgId] && j[sel.cgId][cur.toLowerCase()]; if (p != null) return p; }
    }
    const map = await fetchCryptoPrices([sel.ticker], cur); return map[sel.ticker.toUpperCase()] ?? null;
  }
  return await fetchStockPrice(sel.ticker, cur);
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
  if (needStock && !stockSourceReady()) { if (!silent) openPriceProxySheet(accId); return; }
  _pricesBusy = true; _fxMemo = {}; if (!silent) showToast('Updating prices…', 'info');
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
      try { const p = await fetchStockPrice(t.h.ticker, t.acc.currency); t.h.price = Math.round(p * 100); ok++; }
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
  if (Date.now() - last < 10 * 60 * 1000) return; // refresh at most once every 10 min on tab open
  const needStock = S.accounts.some(a => a.type === 'investment' && (a.holdings || []).some(h => h.assetType === 'stock' && h.ticker));
  if (needStock && !stockSourceReady()) return; // don't prompt on auto
  refreshHoldingPrices(null, true);
}
function toggleAutoRefresh() {
  S.settings.autoRefreshPrices = S.settings.autoRefreshPrices === false ? true : false;
  saveState(); renderCurrentTab();
  showToast(S.settings.autoRefreshPrices === false ? 'Auto-refresh off' : 'Auto-refresh on', 'success');
}
// Primary stock/ETF setup: paste the deployed price-proxy URL (see tools/price-proxy-worker.js).
function openPriceProxySheet(accId) {
  openSheet2('price-proxy', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Turn on stocks &amp; ETFs</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:12px">Live stock/ETF prices need a tiny free helper (a Cloudflare Worker) — it fetches quotes so your holdings update on their own, no API key, works for European ETFs too.</div>
      <ol style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;margin:0 0 14px 18px;padding:0">
        <li>Open <strong>dash.cloudflare.com</strong> → Workers &amp; Pages → Create → Worker.</li>
        <li>Paste the code from <strong>tools/price-proxy-worker.js</strong> in the repo, click Deploy.</li>
        <li>Copy the worker URL and paste it below.</li>
      </ol>
      <div class="form-field"><label class="form-label">Price proxy URL</label>
        <input id="proxy-url-input" class="form-input" type="text" inputmode="url" placeholder="https://price-proxy.you.workers.dev" autocomplete="off" value="${escHtml(S.settings.priceProxyUrl || '')}"></div>
      <button class="btn-primary" onclick="savePriceProxy('${accId || ''}')">Save &amp; turn on</button>
      ${S.settings.priceProxyUrl ? `<button class="btn-secondary" style="width:100%;margin-top:10px" onclick="S.settings.priceProxyUrl='';saveState();closeTopSheet2();showToast('Proxy removed','success')">Remove</button>` : ''}
      <button class="btn-secondary" style="width:100%;margin-top:10px" onclick="openStockKeySheet('${accId || ''}')">Use a Finnhub API key instead (US only)</button>
    </div>`);
  setTimeout(() => document.getElementById('proxy-url-input')?.focus(), 350);
}
function savePriceProxy(accId) {
  const u = (document.getElementById('proxy-url-input')?.value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) { showToast('Paste the full https:// URL', 'error'); return; }
  S.settings.priceProxyUrl = u; saveState(); closeTopSheet2();
  refreshHoldingPrices(accId || null);
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
