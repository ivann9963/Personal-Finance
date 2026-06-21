// === RECURRING ENGINE ===
function getNextOccurrence(dateStr, freq) {
  const d = new Date(dateStr + 'T12:00:00');
  switch(freq) {
    case 'daily':    d.setDate(d.getDate()+1); break;
    case 'weekly':   d.setDate(d.getDate()+7); break;
    case 'biweekly': d.setDate(d.getDate()+14); break;
    case 'monthly':  d.setMonth(d.getMonth()+1); break;
    case 'yearly':   d.setFullYear(d.getFullYear()+1); break;
  }
  return d.toISOString().slice(0,10);
}
function generateRecurring() {
  const today = new Date(); today.setHours(23,59,59,999);
  const todayStr = today.toISOString().slice(0,10);
  const existingKeys = new Set(
    S.transactions.filter(t => t.recurringId).map(t => t.recurringId + '_' + t.date)
  );
  S.recurringSchedules.forEach(sch => {
    if (!sch.active) return;
    let cur = sch.startDate;
    while (cur <= todayStr) {
      if (sch.endDate && cur > sch.endDate) break;
      const key = sch.id + '_' + cur;
      if (!existingKeys.has(key)) {
        const dc = defaultConvert(sch.amount, sch.currency);
        S.transactions.push({
          id: gid(), type: sch.type,
          originalAmount: sch.amount, originalCurrency: sch.currency,
          convertedAmount: dc.ok ? dc.amount : sch.amount,
          exchangeRate: dc.rate || 1,
          category: sch.category, merchant: sch.merchant,
          accountId: sch.accountId, date: cur,
          note: sch.note || '', recurringId: sch.id, isRecurring: true,
          savingsVault: sch.savingsVault || undefined, savingsFlow: sch.savingsVault ? 'in' : undefined
        });
        existingKeys.add(key);
      }
      cur = getNextOccurrence(cur, sch.frequency);
    }
  });
  S.transactions.sort((a,b) => b.date.localeCompare(a.date));
  if (typeof recomputeVaultBalances === 'function') recomputeVaultBalances(); // keep vaults in sync
}

// === RECURRING MANAGER ===
function openRecurringManager() {
  openSheet('recurring-mgr', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Recurring & Subscriptions</div>
    <div class="sheet-body" style="padding:0" id="recurring-mgr-body"></div>`);
  renderRecurringList();
}
function renderRecurringList() {
  const body = document.getElementById('recurring-mgr-body'); if (!body) return;
  const dc = S.settings.defaultCurrency;
  const schs = S.recurringSchedules;
  if (!schs.length) {
    body.innerHTML = `<div class="empty-state"><div style="font-size:40px;margin-bottom:12px">🔄</div>
      <div class="empty-state-title">No recurring payments yet</div>
      <div class="empty-state-desc">Track subscriptions, rent, bills and salary that repeat on a schedule. Add one below — or toggle "Recurring" when adding any transaction.</div></div>
      <div style="padding:0 16px 12px"><button class="btn-primary" onclick="openAddRecurring()">+ Add recurring payment</button></div>
      <div style="padding:0 16px 16px"><button class="btn-secondary" onclick="openSavingsContribution()">🐷 Automatic savings contribution</button></div>`;
    return;
  }
  const rows = schs.map(r => {
    const ci = getCatInfo(r.category);
    const tod = new Date().toISOString().slice(0,10);
    let next = r.startDate;
    while (next <= tod) next = getNextOccurrence(next, r.frequency);
    const sign = r.type==='income' ? '+' : '-';
    const btnBase = 'width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);${r.active?'':'opacity:.5'}">
      <div class="tx-cat-icon" style="background:${ci.color}22">${ci.emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600" class="truncate">${escHtml(r.merchant)}</div>
        <div style="font-size:12px;color:var(--text-tertiary)">${r.frequency} · ${r.active?`next ${formatDate(next,{month:'short',day:'numeric'})}`:'paused'}</div>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px;color:${r.type==='income'?'var(--green)':'var(--red)'}">${sign}${formatCurrency(r.amount,r.currency)}</div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="openEditRecurringSheet('${r.id}')" title="Edit" style="${btnBase};background:var(--bg-elevated);color:var(--text-secondary)">✎</button>
        <button onclick="toggleRecurringActive('${r.id}')" title="${r.active?'Pause':'Resume'}" style="${btnBase};background:var(--bg-elevated);color:var(--text-secondary)">${r.active?'⏸':'▶'}</button>
        <button onclick="deleteRecurringSchedule('${r.id}')" title="Delete" style="${btnBase};background:var(--red-bg);color:var(--red)">✕</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = rows + `
    <div style="padding:16px 16px 8px"><button class="btn-primary" onclick="openAddRecurring()">+ Add recurring payment</button></div>
    <div style="padding:0 16px 16px"><button class="btn-secondary" onclick="openSavingsContribution()">🐷 Automatic savings contribution</button></div>
    <div style="padding:0 16px 16px;font-size:12px;color:var(--text-tertiary);line-height:1.5">Pausing stops future auto-generated entries. Deleting also removes the schedule — already-recorded transactions are kept.</div>`;
}
// Set up an automatic, recurring transfer into a savings vault (e.g. "€50 to Emergency Fund every month").
function openSavingsContribution() {
  const vaults = S.accounts.filter(a => a.isVault || a.type === 'savings');
  const vaultOpts = vaults.map(v => `<option value="${escHtml(v.vaultName||v.name)}">${escHtml(v.name)}</option>`).join('')
    + `<option value="__new__">+ New savings fund…</option>`;
  openSheet2('savings-contrib', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Automatic Savings</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Into fund</label>
        <select id="sc-vault" class="form-input" onchange="document.getElementById('sc-newvault-wrap').style.display=this.value==='__new__'?'block':'none'">${vaultOpts}</select></div>
      <div id="sc-newvault-wrap" class="form-field" style="display:${vaults.length?'none':'block'}"><label class="form-label">New fund name</label>
        <input id="sc-newvault" class="form-input" type="text" placeholder="e.g. Emergency Fund"></div>
      <div class="form-field"><label class="form-label">Amount</label>
        <input id="sc-amt" class="form-input mono" type="number" inputmode="decimal" placeholder="0.00" style="font-size:20px"></div>
      <div class="form-field"><label class="form-label">Frequency</label>
        <select id="sc-freq" class="form-input">
          <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option>
          <option value="monthly" selected>Monthly</option><option value="yearly">Yearly</option>
        </select></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveSavingsContribution()">Start saving</button>
    </div>`);
}
function saveSavingsContribution() {
  let vault = document.getElementById('sc-vault')?.value;
  if (vault === '__new__') {
    vault = (document.getElementById('sc-newvault')?.value || '').trim();
    if (!vault) { showToast('Name the fund', 'error'); return; }
  }
  const amt = parseFloat(document.getElementById('sc-amt')?.value);
  const freq = document.getElementById('sc-freq')?.value || 'monthly';
  if (!vault || isNaN(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const dc = S.settings.defaultCurrency;
  const acc = getOrCreateVaultAccount(vault, dc);
  const cents = Math.round(amt * 100);
  S.recurringSchedules.push({
    id: gid(), type: 'transfer', amount: cents, currency: dc, convertedAmount: cents, exchangeRate: 1,
    category: 'savings', merchant: `Auto-save → ${vault}`, accountId: acc.id,
    frequency: freq, startDate: new Date().toISOString().slice(0,10), active: true,
    savingsVault: vault, note: 'Automatic savings'
  });
  generateRecurring();
  saveState(); closeTopSheet2(); renderRecurringList(); renderCurrentTab();
  showToast(`Auto-saving ${formatCurrency(cents, dc)} ${freq} into ${vault}`, 'success');
}
function toggleRecurringActive(id) {
  const r = S.recurringSchedules.find(s => s.id === id); if (!r) return;
  r.active = !r.active;
  if (r.active) generateRecurring();
  saveState(); renderRecurringList(); renderCurrentTab();
}
function deleteRecurringSchedule(id) {
  confirmDialog({title:'Delete recurring schedule?', message:'Past transactions are kept; no new ones will be generated.', confirmLabel:'Delete', danger:true}, ()=>{
    S.recurringSchedules = S.recurringSchedules.filter(s => s.id !== id);
    saveState(); renderRecurringList(); renderCurrentTab();
    showToast('Recurring schedule deleted', 'success');
  });
}
function openEditRecurringSheet(id) {
  const r = S.recurringSchedules.find(s=>s.id===id); if (!r) return;
  const curOpts = CURRENCIES.map(c=>`<option value="${c.code}"${r.currency===c.code?' selected':''}>${c.code}</option>`).join('');
  const accOpts = S.accounts.map(a=>`<option value="${a.id}"${r.accountId===a.id?' selected':''}>${escHtml(a.name)}</option>`).join('');
  const catPills = S.categories.map(c=>`
    <div class="cat-pill${r.category===c.id?' sel':''}" data-catid="${c.id}" onclick="selectRecurringCat('${c.id}')">
      <div class="cat-pill-emoji">${c.emoji}</div>
      <div class="cat-pill-name">${escHtml(c.name)}</div>
    </div>`).join('');
  openSheet('edit-recurring', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Edit Recurring</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Merchant / Description</label>
        <input id="rec-merchant" class="form-input" type="text" value="${escHtml(r.merchant)}"></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Amount</label>
          <input id="rec-amount" class="form-input mono" type="number" inputmode="decimal" value="${(r.amount/100).toFixed(2)}"></div>
        <div class="form-field"><label class="form-label">Currency</label>
          <select id="rec-currency" class="form-input">${curOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Frequency</label>
          <select id="rec-freq" class="form-input">
            <option value="daily"${r.frequency==='daily'?' selected':''}>Daily</option>
            <option value="weekly"${r.frequency==='weekly'?' selected':''}>Weekly</option>
            <option value="biweekly"${r.frequency==='biweekly'?' selected':''}>Biweekly</option>
            <option value="monthly"${r.frequency==='monthly'?' selected':''}>Monthly</option>
            <option value="yearly"${r.frequency==='yearly'?' selected':''}>Yearly</option>
          </select></div>
        <div class="form-field"><label class="form-label">Start / next date</label>
          <input id="rec-startdate" class="form-input" type="date" value="${r.startDate}"></div>
      </div>
      ${accOpts?`<div class="form-field"><label class="form-label">Account</label>
        <select id="rec-account" class="form-input">${accOpts}</select></div>`:''}
      <div class="form-field"><label class="form-label">Category</label>
        <div class="cat-scroll">${catPills}</div>
        <input id="rec-cat" type="hidden" value="${r.category}"></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveRecurringSchedule('${id}')">Save Changes</button>
    </div>`);
}
function selectRecurringCat(id) {
  document.getElementById('rec-cat').value = id;
  document.querySelectorAll('#sheet-edit-recurring .cat-pill').forEach(p => {
    p.classList.toggle('sel', p.dataset.catid === id);
  });
}
function saveRecurringSchedule(id) {
  const r = S.recurringSchedules.find(s=>s.id===id); if (!r) return;
  const merchant = (document.getElementById('rec-merchant')?.value||'').trim();
  const amtStr   = document.getElementById('rec-amount')?.value||'';
  const currency = document.getElementById('rec-currency')?.value || r.currency;
  const frequency= document.getElementById('rec-freq')?.value || r.frequency;
  const category = document.getElementById('rec-cat')?.value   || r.category;
  const accountId= document.getElementById('rec-account')?.value || r.accountId;
  const startDate= document.getElementById('rec-startdate')?.value || r.startDate;
  if (!merchant) { showToast('Enter a merchant','error'); return; }
  if (!amtStr || isNaN(parseFloat(amtStr)) || parseFloat(amtStr)<=0) { showToast('Enter an amount','error'); return; }
  const cents = Math.round(parseFloat(amtStr)*100);
  const conv  = defaultConvert(cents, currency);
  // Drop future auto-generated entries so they regenerate with the new values
  const today = new Date().toISOString().slice(0,10);
  S.transactions = S.transactions.filter(t => !(t.recurringId===id && t.date>=today && t.isRecurring));
  Object.assign(r, {merchant, amount:cents, currency, frequency, category, accountId, startDate,
    convertedAmount: conv.ok?conv.amount:cents, exchangeRate: conv.rate||1});
  generateRecurring();
  saveState(); closeTopSheet(); renderRecurringList(); renderCurrentTab();
  showToast('Recurring schedule updated','success');
}

// === INSIGHTS ENGINE ===
function getCatInfo(id) {
  return S.categories.find(c => c.id === id) || CATEGORIES.find(c => c.id === id) || {id,name:id,emoji:'❓',color:'#B2BEC3'};
}
function generateInsights() {
  const now = new Date();
  const dc = S.settings.defaultCurrency;
  const diy = now.getDate();
  const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const frac = diy / dim;
  const thisMonStr = now.toISOString().slice(0,7);
  const lastMonDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonStr = lastMonDate.toISOString().slice(0,7);

  const thisTx  = S.transactions.filter(t => t.type==='expense' && t.date.startsWith(thisMonStr));
  const lastTx  = S.transactions.filter(t => t.type==='expense' && t.date.startsWith(lastMonStr));

  const catThis = {}, catLast = {};
  thisTx.forEach(t => { catThis[t.category] = (catThis[t.category]||0) + t.convertedAmount; });
  lastTx.forEach(t => { catLast[t.category] = (catLast[t.category]||0) + t.convertedAmount; });

  const insights = [];

  // 1. Pace alert
  for (const [cat, amt] of Object.entries(catThis)) {
    const last = catLast[cat];
    if (last) {
      const proj = amt / frac;
      const pct  = Math.round((proj/last - 1)*100);
      if (pct >= 40) {
        const ci = getCatInfo(cat);
        insights.push({id:`pace_${cat}`, icon:ci.emoji,
          headline:`${ci.name} up ${pct}% this month`,
          detail:`On pace for ${formatCurrency(proj,dc)} vs ${formatCurrency(last,dc)} last month`,
          priority: pct > 80 ? 10 : 7});
      }
    }
  }

  // 2. Budget streak
  S.budgets.forEach(b => {
    const spent = thisTx.filter(t=>t.category===b.category).reduce((s,t)=>s+t.convertedAmount,0);
    if (spent < b.amount * frac * 0.85) {
      const ci = getCatInfo(b.category);
      insights.push({id:`streak_${b.category}`, icon:'🎯',
        headline:`On track with ${ci.name} budget`,
        detail:`${formatCurrency(spent,dc)} of ${formatCurrency(b.amount,dc)} used`,
        priority:3});
    }
  });

  // 3. Subscription total
  const subSchs = S.recurringSchedules.filter(s => s.category==='subscriptions' && s.active);
  const subMo = subSchs.reduce((s,r) => {
    const c = defaultConvert(r.amount, r.currency);
    const monthly = r.frequency==='monthly' ? (c.ok?c.amount:r.amount)
                  : r.frequency==='yearly'  ? Math.round((c.ok?c.amount:r.amount)/12) : 0;
    return s + monthly;
  }, 0);
  if (subMo > 0) insights.push({id:'subs_total', icon:'📱',
    headline:`You pay ${formatCurrency(subMo,dc)}/mo in subscriptions`,
    detail:`That's ${formatCurrency(subMo*12,dc)} per year`, priority:6});

  // 4. Top category YTD
  const yearStr = now.getFullYear()+'-';
  const yearTx  = S.transactions.filter(t=>t.type==='expense' && t.date.startsWith(yearStr));
  const yearTot = yearTx.reduce((s,t)=>s+t.convertedAmount,0);
  const catYear = {};
  yearTx.forEach(t => { catYear[t.category]=(catYear[t.category]||0)+t.convertedAmount; });
  const topCat = Object.entries(catYear).sort((a,b)=>b[1]-a[1])[0];
  if (topCat && yearTot > 0) {
    const [cat,amt] = topCat;
    const ci = getCatInfo(cat);
    insights.push({id:'top_cat', icon:ci.emoji,
      headline:`${ci.name} is ${Math.round(amt/yearTot*100)}% of total spend this year`,
      detail:formatCurrency(amt,dc)+' so far', priority:5});
  }

  // 5. Savings rate last month
  const lastInc = S.transactions.filter(t=>t.type==='income'&&t.date.startsWith(lastMonStr))
                                .reduce((s,t)=>s+t.convertedAmount,0);
  const lastExp = lastTx.reduce((s,t)=>s+t.convertedAmount,0);
  if (lastInc > 0) {
    const rate = Math.round((lastInc-lastExp)/lastInc*100);
    if (rate > 0) insights.push({id:'savings_rate', icon:'💰',
      headline:`You saved ${rate}% of income last month`,
      detail:formatCurrency(lastInc-lastExp,dc)+' saved', priority:5});
  }

  // 6. Most expensive day this month
  const dayTotals = {};
  thisTx.forEach(t => { dayTotals[t.date]=(dayTotals[t.date]||0)+t.convertedAmount; });
  const maxDay = Object.entries(dayTotals).sort((a,b)=>b[1]-a[1])[0];
  if (maxDay && Object.keys(dayTotals).length > 3) {
    const [dStr, dAmt] = maxDay;
    const dayName = new Intl.DateTimeFormat(undefined,{weekday:'long'}).format(new Date(dStr+'T12:00:00'));
    insights.push({id:'spike_day', icon:'📊',
      headline:`${dayName} was your most expensive day this month`,
      detail:formatCurrency(dAmt,dc)+' spent', priority:6});
  }

  // 7. Detect new recurring
  const merCounts = {};
  S.transactions.filter(t=>t.type==='expense'&&!t.recurringId).forEach(t => {
    const k = `${t.merchant}|${t.originalAmount}|${t.originalCurrency}`;
    if (!merCounts[k]) merCounts[k]={months:new Set(),merchant:t.merchant};
    merCounts[k].months.add(t.date.slice(0,7));
  });
  for (const [, d] of Object.entries(merCounts)) {
    if (d.months.size >= 2 && !S.recurringSchedules.some(r=>r.merchant===d.merchant)) {
      insights.push({id:`new_rec_${d.merchant}`, icon:'🔄',
        headline:`Looks like a new monthly charge from ${d.merchant}`,
        detail:'Tap to tag it as a subscription', priority:8});
      break;
    }
  }

  // 8. Month comparison — lowest in 6 months
  const moSpend = {};
  for (let i=1;i<=6;i++) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    moSpend[d.toISOString().slice(0,7)] = 0;
  }
  S.transactions.filter(t=>t.type==='expense').forEach(t => {
    const m = t.date.slice(0,7);
    if (m in moSpend) moSpend[m] += t.convertedAmount;
  });
  const thisMoProj = thisTx.reduce((s,t)=>s+t.convertedAmount,0) / frac;
  const prevAmts = Object.values(moSpend).filter(v=>v>0);
  if (prevAmts.length >= 3 && thisMoProj < Math.min(...prevAmts)) {
    insights.push({id:'lowest_month', icon:'🏆',
      headline:'This month is shaping up to be your lowest-spend month in 6 months',
      detail:'Keep it up!', priority:7});
  }

  // Filter dismissed (< 7 days)
  const weekAgo = Date.now() - 7*864e5;
  S.dismissedInsights = S.dismissedInsights.filter(d => d.at > weekAgo);
  const dismissed = new Set(S.dismissedInsights.map(d=>d.id));

  return insights.filter(i=>!dismissed.has(i.id)).sort((a,b)=>b.priority-a.priority).slice(0,4);
}

