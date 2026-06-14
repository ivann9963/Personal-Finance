// === ANALYTICS ===
function getDateRange(range) {
  const now = new Date();
  const end = new Date(now); end.setHours(23,59,59,999);
  const start = new Date(now);
  if (range==='1M') start.setMonth(start.getMonth()-1);
  else if (range==='3M') start.setMonth(start.getMonth()-3);
  else if (range==='6M') start.setMonth(start.getMonth()-6);
  else if (range==='1Y') start.setFullYear(start.getFullYear()-1);
  else start.setFullYear(2000); // All
  return {start, end};
}
function getTxInRange(range) {
  const {start, end} = getDateRange(range);
  const startStr = start.toISOString().slice(0,10);
  const endStr   = end.toISOString().slice(0,10);
  return S.transactions.filter(t => t.date >= startStr && t.date <= endStr);
}
function getMonthsInRange(range) {
  const {start, end} = getDateRange(range);
  const months = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(cur.toISOString().slice(0,7));
    cur.setMonth(cur.getMonth()+1);
  }
  return months;
}
function renderAnalytics() {
  const el = document.getElementById('tab-analytics');
  const ranges = ['1M','3M','6M','1Y','All'];
  el.innerHTML = `
    <div class="range-sel">
      ${ranges.map(r=>`<button class="range-btn${_analyticsRange===r?' active':''}" onclick="setAnalyticsRange('${r}')">${r}</button>`).join('')}
    </div>
    <div id="analytics-content"></div>`;
  renderAnalyticsContent();
}
function setAnalyticsRange(r) { _analyticsRange=r; renderAnalyticsContent(); }
function renderAnalyticsContent() {
  const el = document.getElementById('analytics-content'); if (!el) return;
  const dc = S.settings.defaultCurrency;
  const txs = getTxInRange(_analyticsRange);
  const months = getMonthsInRange(_analyticsRange);
  const expTxs = txs.filter(t=>t.type==='expense');
  const incTxs = txs.filter(t=>t.type==='income');
  const hasIncome = incTxs.length > 0;

  // === A: Heatmap ===
  const catMonthData = {};
  expTxs.forEach(t => {
    const m = t.date.slice(0,7);
    if (!catMonthData[t.category]) catMonthData[t.category] = {};
    catMonthData[t.category][m] = (catMonthData[t.category][m]||0) + t.convertedAmount;
  });
  const activeCats = Object.keys(catMonthData).sort((a,b)=>{
    const ta = Object.values(catMonthData[a]).reduce((s,v)=>s+v,0);
    const tb = Object.values(catMonthData[b]).reduce((s,v)=>s+v,0);
    return tb-ta;
  });
  const allVals = activeCats.flatMap(c=>months.map(m=>catMonthData[c][m]||0));
  const maxVal = Math.max(...allVals, 1);
  let hmHtml = '';
  if (activeCats.length) {
    // Header row
    hmHtml += `<div class="hm-grid" style="grid-template-columns:110px repeat(${months.length},52px)">`;
    hmHtml += `<div></div>`;
    months.forEach(m => {
      const lbl = new Intl.DateTimeFormat(undefined,{month:'short'}).format(new Date(m+'-01T12:00:00'));
      hmHtml += `<div class="hm-month-lbl">${lbl}</div>`;
    });
    activeCats.forEach(cat => {
      const ci = getCatInfo(cat);
      hmHtml += `<div class="hm-row-lbl">${ci.emoji} ${escHtml(ci.name)}</div>`;
      months.forEach(m => {
        const v = catMonthData[cat][m]||0;
        const intensity = v/maxVal;
        const bg = hmColor(intensity);
        const lbl = v>0?formatCurrency(v,dc,true):'';
        hmHtml += `<div class="hm-cell${v===0?' empty':''}" style="background:${bg}" onclick="openHeatmapDetail('${escHtml(cat)}','${m}')">${lbl}</div>`;
      });
    });
    hmHtml += `</div>`;
  }
  // === B: Spending Trend ===
  const trendLabels=[], trendData=[];
  months.forEach(m=>{
    const total=expTxs.filter(t=>t.date.startsWith(m)).reduce((s,t)=>s+t.convertedAmount,0);
    const lbl=new Intl.DateTimeFormat(undefined,{month:'short',year:'2-digit'}).format(new Date(m+'-01T12:00:00'));
    trendLabels.push(lbl); trendData.push(total);
  });
  const avgTrend = trendData.reduce((s,v)=>s+v,0) / (trendData.length||1);
  const last3 = trendData.slice(-3);
  const rising = last3.length>=2 && last3.every((v,i)=>i===0||v>last3[i-1]);
  const trendInsight = rising ? 'Your spending has increased for the last 3 months' :
    `Monthly average: ${formatCurrency(avgTrend,dc)}`;

  // === C: Category breakdown ===
  const catTotals = {};
  expTxs.forEach(t=>{catTotals[t.category]=(catTotals[t.category]||0)+t.convertedAmount;});
  const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  const catTotal = catEntries.reduce((s,[,v])=>s+v,0);
  const donutLabels = catEntries.map(([c])=>getCatInfo(c).name);
  const donutData2 = catEntries.map(([,v])=>v);
  const donutColors2 = catEntries.map(([c])=>getCatInfo(c).color);
  const catRows = catEntries.slice(0,8).map(([c,v])=>{
    const ci=getCatInfo(c);
    const pct=catTotal>0?Math.round(v/catTotal*100):0;
    return `<div class="legend-item" style="width:100%;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)" onclick="filterByCategory('${escHtml(c)}')">
      <div style="display:flex;align-items:center;gap:8px"><div class="legend-dot" style="background:${ci.color}"></div><span>${ci.emoji} ${escHtml(ci.name)}</span></div>
      <div style="display:flex;align-items:center;gap:12px"><span style="color:var(--text-tertiary)">${pct}%</span><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-variant-numeric:tabular-nums">${formatCurrency(v,dc,true)}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  }).join('');

  // === D: Top Merchants ===
  const merTotals={}, merCts={};
  expTxs.forEach(t=>{merTotals[t.merchant]=(merTotals[t.merchant]||0)+t.convertedAmount;merCts[t.merchant]=(merCts[t.merchant]||0)+1;});
  const topMers = Object.entries(merTotals).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxMer = topMers[0]?.[1]||1;
  const merRows = topMers.map(([name,amt],i)=>`
    <div class="merchant-row" onclick="filterByMerchant('${escHtml(name)}')">
      <div class="merchant-rank">${i+1}</div>
      <div class="merchant-info"><div class="merchant-name truncate">${escHtml(name)}</div><div class="merchant-ct">${merCts[name]} transactions</div></div>
      <div class="merchant-bar-wrap"><div class="merchant-bar" style="width:${Math.round(amt/maxMer*100)}%"></div></div>
      <div class="merchant-amt">${formatCurrency(amt,dc,true)}</div>
    </div>`).join('');

  // === E: Income vs Expense ===
  const incData=[], expData=[];
  months.forEach(m=>{
    incData.push(incTxs.filter(t=>t.date.startsWith(m)).reduce((s,t)=>s+t.convertedAmount,0));
    expData.push(expTxs.filter(t=>t.date.startsWith(m)).reduce((s,t)=>s+t.convertedAmount,0));
  });

  el.innerHTML = `
    <div class="analytics-sec">
      <div class="analytics-sec-title">📊 Spending Heatmap</div>
      ${activeCats.length ? `<div class="chart-box"><div class="heatmap-outer">${hmHtml}</div></div>` : `<div class="chart-box" style="color:var(--text-secondary);font-size:14px;padding:24px;text-align:center">No expense data in this range</div>`}
    </div>
    <div class="analytics-sec">
      <div class="analytics-sec-title">📈 Spending Trend</div>
      <div class="chart-box"><div class="chart-inner"><canvas id="trend-chart"></canvas></div>
      <div class="chart-insight-txt">${escHtml(trendInsight)}</div></div>
    </div>
    <div class="analytics-sec">
      <div class="analytics-sec-title">🍩 Category Breakdown</div>
      <div class="chart-box">
        ${catEntries.length?`<div class="chart-inner"><canvas id="cat-donut"></canvas><div class="donut-center"><div class="donut-center-lbl">Total Spent</div><div class="donut-center-amt">${formatCurrency(catTotal,dc,true)}</div></div></div><div>${catRows}</div>`:
          `<div style="color:var(--text-secondary);font-size:14px;text-align:center;padding:16px">No data</div>`}
      </div>
    </div>
    <div class="analytics-sec">
      <div class="analytics-sec-title">🏪 Top Merchants</div>
      <div class="chart-box">${topMers.length?merRows:`<div style="color:var(--text-secondary);font-size:14px;text-align:center;padding:16px">No data</div>`}</div>
    </div>
    ${hasIncome?`<div class="analytics-sec">
      <div class="analytics-sec-title">💵 Income vs Expense</div>
      <div class="chart-box"><div class="chart-inner"><canvas id="inc-exp-chart"></canvas></div></div>
    </div>`:''}
    <div style="height:16px"></div>`;

  requestAnimationFrame(()=>{
    // Guard: tab may have been switched before rAF fires
    if (!document.getElementById('trend-chart')) return;
    mkLine('trend-chart', trendLabels, [{label:'Spending',data:trendData,borderColor:'#F0B429',backgroundColor:'rgba(240,180,41,.08)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#F0B429'}]);
    if (catEntries.length && document.getElementById('cat-donut')) mkDonut('cat-donut', donutLabels, donutData2, donutColors2);
    if (hasIncome && document.getElementById('inc-exp-chart')) mkBar('inc-exp-chart', trendLabels, [
      {label:'Income', data:incData, backgroundColor:'rgba(63,185,80,.7)'},
      {label:'Expense',data:expData, backgroundColor:'rgba(248,81,73,.7)'}
    ]);
  });
}
function hmColor(intensity) {
  if (intensity===0) return 'var(--bg-elevated)';
  // Warm red gradient — minimum opacity 0.2 so even tiny amounts are visible
  const r=Math.round(50+(220-50)*intensity), g=Math.round(80-60*intensity), b=Math.round(80-60*intensity);
  return `rgba(${r},${g},${b},${0.2+intensity*0.8})`;
}
function filterByMerchant(name) {
  _txSearch=name; _txFilter='all'; _txPage=1;
  switchTab('transactions');
  _tabsInit['transactions']=true; renderTransactions();
}
function filterByCategory(catId) {
  _txSearch=''; _txFilter='cat:'+catId; _txPage=1;
  switchTab('transactions');
  _tabsInit['transactions']=true; renderTransactions();
}

