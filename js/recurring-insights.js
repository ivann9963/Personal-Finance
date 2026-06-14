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
          note: sch.note || '', recurringId: sch.id, isRecurring: true
        });
        existingKeys.add(key);
      }
      cur = getNextOccurrence(cur, sch.frequency);
    }
  });
  S.transactions.sort((a,b) => b.date.localeCompare(a.date));
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

