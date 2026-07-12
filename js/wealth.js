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

// --- Future Wealth sheet ---
const WEALTH_MILESTONES = [1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000, 200000000]; // cents
function wealthPlan() {
  const p = S.settings.wealthPlan || {};
  return {
    monthly: p.monthly != null ? p.monthly : Math.max(0, avgMonthlySavings()),
    rate: p.rate != null ? p.rate : 5,
    years: p.years || 10,
  };
}
function openWealthSheet() {
  const plan = wealthPlan();
  const dc = S.settings.defaultCurrency;
  const inv = investmentSummary();
  const invLine = inv ? `
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <div style="flex:1;background:var(--bg-elevated);border-radius:var(--radius);padding:12px">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Invested</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px">${formatCurrency(inv.basis, dc, true)}</div>
      </div>
      <div style="flex:1;background:var(--bg-elevated);border-radius:var(--radius);padding:12px">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Value now</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px">${formatCurrency(inv.value, dc, true)}</div>
      </div>
      <div style="flex:1;background:var(--bg-elevated);border-radius:var(--radius);padding:12px">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Gain</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;color:${inv.gain >= 0 ? 'var(--green)' : 'var(--red)'}">${inv.gain >= 0 ? '+' : ''}${formatCurrency(inv.gain, dc, true)} · ${inv.pct >= 0 ? '+' : ''}${inv.pct.toFixed(1)}%</div>
      </div>
    </div>` : '';
  const horizonBtns = [5, 10, 20, 30].map(y =>
    `<button class="seg-btn${plan.years === y ? ' active' : ''}" data-years="${y}" onclick="setWealthYears(${y})">${y}y</button>`).join('');
  openSheet('wealth', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Future Wealth</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px">
        Starting from your net worth of <strong>${formatCurrency(netWorthNow(), dc)}</strong>, here's where steady saving takes you. The gap between the two lines is compounding doing the work.
      </div>
      ${invLine}
      <div class="form-row">
        <div class="form-field"><label class="form-label">Adding per month</label>
          <input id="wealth-monthly" class="form-input mono" type="number" inputmode="decimal" step="50" value="${(plan.monthly / 100).toFixed(0)}" onchange="updateWealthSheet()"></div>
        <div class="form-field"><label class="form-label">Annual return %</label>
          <input id="wealth-rate" class="form-input mono" type="number" inputmode="decimal" step="0.5" value="${plan.rate}" onchange="updateWealthSheet()"></div>
      </div>
      <div class="seg" id="wealth-horizon" style="margin-bottom:16px">${horizonBtns}</div>
      <div style="background:var(--bg-elevated);border-radius:var(--radius);padding:14px 12px 8px;margin-bottom:16px">
        <div id="wealth-headline" style="font-size:14px;font-weight:700;margin:0 4px 10px"></div>
        <div style="height:180px"><canvas id="wealth-chart"></canvas></div>
      </div>
      <div id="wealth-milestones"></div>
      <div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;margin-top:14px">
        A projection, not a promise — markets vary year to year. 5% is a cautious long-run mixed-portfolio guess; world stock indexes have averaged ~7% before inflation. Your inputs are saved.
      </div>
    </div>`);
  requestAnimationFrame(updateWealthSheet);
}
function setWealthYears(y) {
  S.settings.wealthPlan = { ...wealthPlan(), years: y };
  document.querySelectorAll('#wealth-horizon .seg-btn').forEach(b => b.classList.toggle('active', +b.dataset.years === y));
  updateWealthSheet();
}
// Re-read inputs, persist the plan, redraw chart + milestones. Cheap enough to run on every change.
function updateWealthSheet() {
  const mEl = document.getElementById('wealth-monthly'), rEl = document.getElementById('wealth-rate');
  if (!mEl) return;
  const monthly = Math.round((parseFloat(mEl.value) || 0) * 100);
  const rate = Math.min(30, Math.max(-10, parseFloat(rEl.value) || 0));
  const years = (S.settings.wealthPlan && S.settings.wealthPlan.years) || wealthPlan().years;
  S.settings.wealthPlan = { monthly, rate, years };
  saveState();
  const dc = S.settings.defaultCurrency;
  const start = netWorthNow();
  const months = years * 12;
  const grown = projectWealth(start, monthly, rate, months);
  const flat = projectWealth(start, monthly, 0, months);
  const final = grown[grown.length - 1];
  const contributed = flat[flat.length - 1];
  const growthPart = final - contributed;
  document.getElementById('wealth-headline').innerHTML =
    `~${formatCurrency(final, dc, true)} in ${years} years <span style="color:var(--text-tertiary);font-weight:500">· ${formatCurrency(Math.max(0, growthPart), dc, true)} of it is growth</span>`;
  // Yearly points keep the chart light (a 30y horizon is 360 monthly points otherwise).
  const yearIdx = [];
  for (let y = 0; y <= years; y++) yearIdx.push(y * 12);
  const nowYear = new Date().getFullYear();
  mkLine('wealth-chart', yearIdx.map(i => String(nowYear + i / 12)), [ // mkLine formats values as cents
    { label: 'With growth', data: yearIdx.map(i => grown[i]), borderColor: '#F0B429', backgroundColor: 'rgba(240,180,41,.10)', fill: true, pointRadius: 0, tension: .3, borderWidth: 2 },
    { label: 'Contributions only', data: yearIdx.map(i => flat[i]), borderColor: '#8B949E', borderDash: [5, 4], pointRadius: 0, tension: .1, borderWidth: 1.5, fill: false },
  ]);
  // The next few round milestones and when they land.
  const upcoming = WEALTH_MILESTONES.filter(t => t > start).slice(0, 3);
  const rows = upcoming.map(t => {
    const m = monthsToReach(t, start, monthly, rate);
    const when = m == null ? 'beyond 50 years' : m <= 12 ? `~${m} month${m !== 1 ? 's' : ''}` : `~${(m / 12).toFixed(m < 60 ? 1 : 0)} years`;
    const reachedInHorizon = m != null && m <= months;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--border)">
      <span style="font-size:18px">${reachedInHorizon ? '🏁' : '🔭'}</span>
      <span style="font-weight:600;font-family:'JetBrains Mono',monospace">${formatCurrency(t, dc, true)}</span>
      <span style="margin-left:auto;font-size:13px;color:${reachedInHorizon ? 'var(--green)' : 'var(--text-tertiary)'}">${when}</span>
    </div>`;
  }).join('');
  document.getElementById('wealth-milestones').innerHTML = rows ?
    `<div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Milestones</div>${rows}` : '';
}

// Compact dashboard strip: one number that makes the future concrete, tap for the full sheet.
function wealthTeaserHTML() {
  if (!S.accounts.length) return '';
  const plan = wealthPlan();
  const dc = S.settings.defaultCurrency;
  const grown = projectWealth(netWorthNow(), plan.monthly, plan.rate, plan.years * 12);
  return `<div class="velocity-strip vel-green" onclick="openWealthSheet()" style="cursor:pointer">
    🔮 At ${formatCurrency(plan.monthly, dc, true)}/mo → ~${formatCurrency(grown[grown.length - 1], dc, true)} in ${plan.years} years · plan it →
  </div>`;
}
