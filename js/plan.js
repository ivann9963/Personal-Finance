// === PLAN ===
function renderPlan() {
  const el = document.getElementById('tab-plan');
  el.innerHTML = `
    <div class="seg" style="margin:12px 16px">
      <button class="seg-btn${_planView==='budgets'?' active':''}" onclick="setPlanView('budgets')">Budgets</button>
      <button class="seg-btn${_planView==='calendar'?' active':''}" onclick="setPlanView('calendar')">Calendar</button>
    </div>
    <div id="plan-content"></div>`;
  renderPlanContent();
}
function setPlanView(v) { _planView=v; renderPlan(); }
function renderPlanContent() {
  const el = document.getElementById('plan-content'); if (!el) return;
  if (_planView==='budgets') renderBudgets(el);
  else renderCalendar(el);
}
function renderBudgets(el) {
  const dc = S.settings.defaultCurrency;
  const y = _budgetMonth.getFullYear(), m = _budgetMonth.getMonth();
  const monStr = `${y}-${String(m+1).padStart(2,'0')}`;
  const label = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(_budgetMonth);
  const dim = new Date(y, m+1, 0).getDate();
  const diy = y===new Date().getFullYear()&&m===new Date().getMonth() ? new Date().getDate() : dim;
  const frac = diy/dim;
  const monthTx = S.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(monStr));
  // Donut data
  const donutData=[], donutLabels=[], donutColors=[];
  S.budgets.forEach(b=>{
    const spent=monthTx.filter(t=>t.category===b.category).reduce((s,t)=>s+t.convertedAmount,0);
    donutData.push(spent); donutLabels.push(getCatInfo(b.category).name);
    donutColors.push(getCatInfo(b.category).color);
  });
  const totalBudget = S.budgets.reduce((s,b)=>{const c=defaultConvert(b.amount,b.currency);return s+(c.ok?c.amount:b.amount);},0);
  const totalSpent = donutData.reduce((s,v)=>s+v,0);
  // Budget cards
  const lastMonStr = new Date(y,m-1,1).toISOString().slice(0,7);
  const lastMonTx = S.transactions.filter(t=>t.type==='expense'&&t.date.startsWith(lastMonStr));
  const budgetCards = S.budgets.map(b=>{
    const ci = getCatInfo(b.category);
    const budAmt = (() => { const c=defaultConvert(b.amount,b.currency); return c.ok?c.amount:b.amount; })();
    const spent = monthTx.filter(t=>t.category===b.category).reduce((s,t)=>s+t.convertedAmount,0);
    const lastSpent = lastMonTx.filter(t=>t.category===b.category).reduce((s,t)=>s+t.convertedAmount,0);
    const pct = budAmt>0 ? Math.min(spent/budAmt*100,100) : 0;
    const over = spent > budAmt;
    const fillClass = pct<70?'green-fill':pct<90?'amber-fill':'red-fill';
    const delta = lastSpent>0 ? Math.round((spent-lastSpent)/lastSpent*100) : null;
    const remaining = budAmt - spent;
    const daysLeft = dim - diy;
    return `<div class="budget-card${over?' exceeded':''}" style="cursor:pointer" onclick="openEditBudget('${escHtml(b.category)}')">
      <div class="budget-hdr">
        <div class="budget-name">${ci.emoji} ${escHtml(ci.name)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${delta!==null?`<span class="budget-delta ${delta>0?'up':'down'}">${delta>0?'+':''}${delta}%</span>`:''}
          <div class="budget-amts"><span class="budget-spent" style="color:${over?'var(--red)':'var(--text-primary)'}">${formatCurrency(spent,dc)}</span><span class="budget-total"> / ${formatCurrency(budAmt,dc)}</span></div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${pct>0?Math.max(pct,3):0}%"></div></div>
      <div class="budget-footer">
        <span>${over?'⚠️ Over budget':formatCurrency(remaining,dc)+' remaining'}</span>
        <span>${daysLeft} days left</span>
      </div>
    </div>`;
  }).join('');
  // Subscriptions
  const subSchs = S.recurringSchedules.filter(s=>s.category==='subscriptions'&&s.active);
  const subMonthly = subSchs.reduce((s,r)=>{const c=defaultConvert(r.amount,r.currency);return s+(c.ok?c.amount:r.amount);},0);
  const subRows = subSchs.map(r => {
    const c = defaultConvert(r.amount, r.currency);
    const mo = c.ok?c.amount:r.amount;
    const annual = r.frequency==='monthly'?mo*12:r.frequency==='yearly'?mo:mo*12;
    // Next charge
    let next = r.startDate;
    const tod = new Date().toISOString().slice(0,10);
    while(next <= tod) next = getNextOccurrence(next, r.frequency);
    return `<div class="sub-row">
      <div class="sub-icon">📱</div>
      <div class="sub-info"><div class="sub-name">${escHtml(r.merchant)}</div><div class="sub-cycle">Next: ${formatDate(next,{month:'short',day:'numeric'})} · ${r.frequency}</div></div>
      <div class="sub-right"><div class="sub-amt">${formatCurrency(r.frequency==='monthly'?r.amount:Math.round(r.amount/12),r.currency)}/mo</div><div class="sub-annual">${formatCurrency(annual,dc)}/yr</div></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="plan-month-nav">
      <button onclick="shiftBudgetMonth(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
      <span class="m-label">${escHtml(label)}</span>
      <button onclick="shiftBudgetMonth(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
    ${S.budgets.length?`<div class="donut-wrap"><canvas id="budget-donut"></canvas><div class="donut-center"><div class="donut-center-lbl">Spent</div><div class="donut-center-amt">${formatCurrency(totalSpent,dc,true)}</div></div></div>`:''}
    ${budgetCards||`<div class="empty-state"><div style="font-size:40px;margin-bottom:12px">🎯</div><div class="empty-state-title">No budgets yet</div><div class="empty-state-desc">Set spending limits by category</div><button class="empty-state-btn" onclick="openAddBudgetSheet()">Add Budget</button></div>`}
    ${S.budgets.length?`<button class="add-acc-btn" style="margin:4px 16px 0" onclick="openAddBudgetSheet()">+ Add Budget</button>`:''}
    <div class="section-hdr" style="padding-top:20px;display:flex;align-items:center;justify-content:space-between">
      <span>Subscriptions</span>
      <button class="see-all-btn" style="font-size:13px;color:var(--accent);font-weight:500" onclick="openRecurringManager()">Manage</button>
    </div>
    ${subSchs.length?`
      <div class="sub-totals">
        <div class="sub-monthly-amt">${formatCurrency(subMonthly,dc)}</div>
        <div class="sub-annual-lbl">per month · ${formatCurrency(subMonthly*12,dc)} per year</div>
      </div>
      ${subRows}`
    :`<div style="padding:16px;color:var(--text-secondary);font-size:14px">No subscriptions tracked. Tag recurring transactions with <strong>Subscriptions</strong> category.</div>`}
    <div style="height:16px"></div>`;
  if (S.budgets.length) {
    requestAnimationFrame(()=> {
      if (document.getElementById('budget-donut')) mkDonut('budget-donut', donutLabels, donutData, donutColors);
    });
  }
}
function shiftBudgetMonth(d) {
  _budgetMonth.setMonth(_budgetMonth.getMonth()+d);
  renderPlanContent();
}
function renderCalendar(el) {
  const dc = S.settings.defaultCurrency;
  const y = _calMonth.getFullYear(), m = _calMonth.getMonth();
  const dim = new Date(y,m+1,0).getDate();
  const label = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(_calMonth);
  const monStr = `${y}-${String(m+1).padStart(2,'0')}`;
  // Daily totals
  const dailyFlow = {};
  S.transactions.filter(t=>t.date.startsWith(monStr)).forEach(t=>{
    dailyFlow[t.date]=(dailyFlow[t.date]||0)+(t.type==='income'?t.convertedAmount:t.type==='expense'?-t.convertedAmount:0);
  });
  const maxAbs = Math.max(...Object.values(dailyFlow).map(Math.abs), 1);
  // First weekday (Monday-based if setting)
  const monFirst = S.settings.firstDayOfWeek==='monday';
  const firstWd = new Date(y,m,1).getDay(); // 0=Sun
  const startOffset = monFirst ? (firstWd+6)%7 : firstWd;
  const dayHeaders = monFirst ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S'];
  let calHtml = '';
  // Headers
  dayHeaders.forEach(h => { calHtml+=`<div class="cal-day-hdr">${h}</div>`; });
  calHtml += `<div></div>`;// week total header
  // Empty cells
  for(let i=0;i<startOffset;i++) calHtml+=`<div class="cal-cell empty"></div>`;
  // Day cells
  let weekNet=0, weekDayCt=0;
  for(let d=1;d<=dim;d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const flow = dailyFlow[ds]||0;
    weekNet += flow; weekDayCt++;
    const intensity = flow/maxAbs;
    const bg = calCellColor(intensity);
    const isToday = ds===new Date().toISOString().slice(0,10);
    const amtLbl = flow!==0?formatCurrency(Math.abs(flow),dc,true):'';
    calHtml += `<div class="cal-cell${isToday?' today':''}" style="background:${bg}" onclick="openDayDetail('${ds}')">
      <span class="cal-day-num">${d}</span>
      ${amtLbl?`<span class="cal-day-amt">${amtLbl}</span>`:''}
    </div>`;
    // Week total at end of week or last day
    const weekDay = (startOffset+d-1) % 7;
    if (weekDay===6 || d===dim) {
      calHtml += `<div class="cal-week-total" style="color:${weekNet>0?'var(--green)':weekNet<0?'var(--red)':'var(--text-tertiary)'}"><span>${weekNet!==0?formatCurrency(Math.abs(weekNet),dc,true):''}</span></div>`;
      weekNet=0; weekDayCt=0;
    }
  }
  // Month summary
  const totIn  = S.transactions.filter(t=>t.date.startsWith(monStr)&&t.type==='income').reduce((s,t)=>s+t.convertedAmount,0);
  const totOut = S.transactions.filter(t=>t.date.startsWith(monStr)&&t.type==='expense').reduce((s,t)=>s+t.convertedAmount,0);
  const netMo  = totIn - totOut;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px 12px">
      <button style="width:36px;height:36px;border-radius:50%;background:var(--bg-elevated);color:var(--text-secondary);display:flex;align-items:center;justify-content:center" onclick="shiftCalMonth(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
      <span style="font-size:17px;font-weight:700">${escHtml(label)}</span>
      <button style="width:36px;height:36px;border-radius:50%;background:var(--bg-elevated);color:var(--text-secondary);display:flex;align-items:center;justify-content:center" onclick="shiftCalMonth(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
    <div class="cal-grid">${calHtml}</div>
    <div class="cal-summary">
      <div class="cal-sum-item"><div class="cal-sum-lbl">In</div><div class="cal-sum-val" style="color:var(--green)">${formatCurrency(totIn,dc,true)}</div></div>
      <div class="cal-sum-item"><div class="cal-sum-lbl">Out</div><div class="cal-sum-val" style="color:var(--red)">${formatCurrency(totOut,dc,true)}</div></div>
      <div class="cal-sum-item"><div class="cal-sum-lbl">Net</div><div class="cal-sum-val" style="color:${netMo>=0?'var(--green)':'var(--red)'}">${formatCurrency(netMo,dc,true)}</div></div>
    </div>`;
}
function calCellColor(intensity) {
  if (intensity===0) return 'var(--bg-elevated)';
  if (intensity > 0) {
    const a = Math.min(intensity*0.9, 0.85);
    return `rgba(63,185,80,${a})`;
  } else {
    const a = Math.min(-intensity*0.9, 0.85);
    return `rgba(248,81,73,${a})`;
  }
}
function shiftCalMonth(d) {
  _calMonth.setMonth(_calMonth.getMonth()+d);
  renderPlanContent();
}
function openAddBudgetSheet(editCat) {
  const existing = editCat ? S.budgets.find(b=>b.category===editCat) : null;
  // When editing, lock to that category; when adding, offer categories without a budget yet.
  const cats = existing ? S.categories.filter(c=>c.id===editCat)
                        : S.categories.filter(c=>!S.budgets.some(b=>b.category===c.id));
  const catOpts = (cats.length?cats:S.categories).map(c=>`<option value="${c.id}"${existing&&existing.category===c.id?' selected':''}>${c.emoji} ${escHtml(c.name)}</option>`).join('');
  openSheet('add-budget',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">${existing?'Edit Budget':'Add Budget'}</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Category</label>
        <select id="bud-cat" class="form-input"${existing?' disabled':''}>${catOpts}</select></div>
      <div class="form-field"><label class="form-label">Monthly Amount</label>
        <input id="bud-amt" class="form-input mono" type="number" inputmode="decimal" placeholder="0.00" value="${existing?(existing.amount/100).toFixed(2):''}" style="font-size:20px"></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveBudget('${existing?escHtml(existing.category):''}')">${existing?'Save Changes':'Save Budget'}</button>
      ${existing?`<div style="height:10px"></div><button class="btn-danger" onclick="deleteBudget('${escHtml(existing.category)}')">Delete Budget</button>`:''}
    </div>`);
}
function openEditBudget(cat) { openAddBudgetSheet(cat); }
function saveBudget(lockedCat) {
  const cat = lockedCat || document.getElementById('bud-cat').value;
  const amt = parseFloat(document.getElementById('bud-amt').value);
  if (!cat||isNaN(amt)||amt<=0) { showToast('Enter a valid amount','error'); return; }
  const existing = S.budgets.findIndex(b=>b.category===cat);
  const bud = {id:gid(),category:cat,amount:Math.round(amt*100),currency:S.settings.defaultCurrency};
  if (existing>=0) S.budgets[existing]=bud; else S.budgets.push(bud);
  saveState(); closeTopSheet(); renderPlanContent();
  showToast('Budget saved','success');
}
function deleteBudget(cat) {
  S.budgets = S.budgets.filter(b=>b.category!==cat);
  saveState(); closeTopSheet(); renderPlanContent();
  showToast('Budget deleted','success');
}

