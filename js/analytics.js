// === ANALYTICS ===
const ANALYTICS_SECTIONS = [
  {id:'heatmap',   label:'Spending Heatmap',  emoji:'📊'},
  {id:'trend',     label:'Spending Trend',    emoji:'📈'},
  {id:'breakdown', label:'Category Breakdown',emoji:'🍩'},
  {id:'merchants', label:'Top Merchants',     emoji:'🏪'},
  {id:'incexp',    label:'Income vs Expense', emoji:'💵'},
];
// User's saved section order (settings.analyticsOrder), with any new/missing sections appended.
function currentAnalyticsOrder() {
  const def = ANALYTICS_SECTIONS.map(s=>s.id);
  const order = (S.settings.analyticsOrder||[]).filter(id => def.includes(id));
  def.forEach(id => { if (!order.includes(id)) order.push(id); });
  return order;
}
// Reorder sheet: a simple uniform-row drag list (reuses the .cat-row drag pattern + CSS).
function openAnalyticsLayout() {
  const rows = currentAnalyticsOrder().map((id,i) => {
    const s = ANALYTICS_SECTIONS.find(x=>x.id===id); if (!s) return '';
    return `<div class="cat-row" data-id="${id}" data-idx="${i}">
      <div class="cat-drag-handle" title="Drag to reorder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg></div>
      <div style="flex:1;display:flex;align-items:center;gap:10px"><span style="font-size:18px">${s.emoji}</span><span style="font-weight:600;font-size:15px">${escHtml(s.label)}</span></div>
    </div>`;
  }).join('');
  openSheet('analytics-layout', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Reorder sections</div>
    <div class="sheet-body" style="padding:0" id="analytics-layout-body">
      <div style="font-size:12px;color:var(--text-tertiary);padding:8px 16px">Drag the ≡ handle to set the order of your Analytics cards.</div>
      ${rows}
      <div style="padding:16px"><button class="btn-primary" onclick="closeTopSheet()">Done</button></div>
    </div>`);
  setupSectionReorder();
}
function setupSectionReorder() {
  const body = document.getElementById('analytics-layout-body'); if (!body) return;
  const rows = [...body.querySelectorAll('.cat-row')];
  if (rows.length < 2) return;
  const rowH = rows[0].offsetHeight || 56;
  rows.forEach(row => {
    const handle = row.querySelector('.cat-drag-handle'); if (!handle) return;
    let startY=0, startIdx=0, targetIdx=0, dragging=false;
    const onMove = e => {
      if (!dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = y - startY;
      row.style.transform = `translateY(${dy}px)`;
      targetIdx = Math.max(0, Math.min(rows.length-1, startIdx + Math.round(dy/rowH)));
      rows.forEach((r,i) => {
        if (r===row) return;
        let sh = 0;
        if (startIdx<targetIdx && i>startIdx && i<=targetIdx) sh = -rowH;
        else if (startIdx>targetIdx && i>=targetIdx && i<startIdx) sh = rowH;
        r.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      row.classList.remove('cat-dragging');
      rows.forEach(r => { r.style.transform = ''; });
      if (targetIdx !== startIdx) {
        const order = currentAnalyticsOrder();
        const [m] = order.splice(startIdx, 1);
        order.splice(targetIdx, 0, m);
        S.settings.analyticsOrder = order;
        saveState();
        openAnalyticsLayout();      // rebuild the sheet with fresh order/indices
        renderAnalyticsContent();   // re-render the page underneath in the new order
      }
    };
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      dragging = true; startIdx = rows.indexOf(row); targetIdx = startIdx;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      row.classList.add('cat-dragging');
      haptic('medium'); // lift
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
// --- Sort + show/hide controls (persisted in settings) ---
function analyticsSort() {
  return { cats:'amount', merchants:'amount', ...(S.settings.analyticsSort||{}) };
}
function setAnalyticsSort(which, mode) {
  S.settings.analyticsSort = { ...analyticsSort(), [which]: mode };
  saveState();
  renderAnalyticsContent();
}
function analyticsHidden() { return new Set(S.settings.analyticsHiddenCats || []); }
// Sort category ids by the chosen mode (amount / custom drag order / name / # transactions).
function sortCategoryIds(ids, totals, counts) {
  const mode = analyticsSort().cats;
  const order = S.categories.map(c=>c.id);
  return ids.slice().sort((a,b)=>{
    if (mode==='name')   return getCatInfo(a).name.localeCompare(getCatInfo(b).name);
    if (mode==='count')  return (counts[b]||0)-(counts[a]||0);
    if (mode==='custom') return order.indexOf(a)-order.indexOf(b);
    return (totals[b]||0)-(totals[a]||0); // amount (default)
  });
}
function sortMerchantEntries(entries, counts) {
  const mode = analyticsSort().merchants;
  return entries.slice().sort((a,b)=>{
    if (mode==='name')  return a[0].localeCompare(b[0]);
    if (mode==='count') return (counts[b[0]]||0)-(counts[a[0]]||0);
    return b[1]-a[1]; // amount (default)
  });
}
// Compact inline sort dropdown for a section header.
function analyticsSortSelect(which, opts) {
  const cur = analyticsSort()[which];
  return `<select onchange="setAnalyticsSort('${which}',this.value)" onclick="event.stopPropagation()" style="font-size:11px;background:var(--bg-elevated);color:var(--text-secondary);border:none;border-radius:6px;padding:4px 6px;font-weight:600">
    ${opts.map(([v,l])=>`<option value="${v}"${cur===v?' selected':''}>${l}</option>`).join('')}</select>`;
}
// Show/hide categories sheet — toggles which categories appear in the Heatmap + Breakdown.
function openAnalyticsCategoryFilter() {
  const txs = getTxInRange(_analyticsRange).filter(t=>t.type==='expense');
  const totals = {}; txs.forEach(t=>totals[t.category]=(totals[t.category]||0)+t.convertedAmount);
  const hidden = analyticsHidden();
  const dc = S.settings.defaultCurrency;
  const rows = S.categories.map(c=>{
    const isHidden = hidden.has(c.id);
    const tot = totals[c.id]||0;
    return `<div class="settings-row" data-catfilter="${escHtml(c.id)}" onclick="toggleAnalyticsCat('${jsAttr(c.id)}')" style="opacity:${isHidden?.45:1}">
      <div style="font-size:18px;width:28px;text-align:center">${c.emoji}</div>
      <div class="settings-row-info"><div class="settings-row-lbl">${escHtml(c.name)}</div><div class="settings-row-val">${tot?formatCurrency(tot,dc,true):'—'}</div></div>
      <div class="settings-row-right catfilter-icon" style="font-size:16px">${isHidden?'🙈':'👁️'}</div>
    </div>`;
  }).join('');
  openSheet('analytics-catfilter', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Show / hide categories</div>
    <div class="sheet-body" style="padding:0">
      <div style="font-size:12px;color:var(--text-tertiary);padding:8px 16px">Tap to hide a category from the Heatmap and Breakdown.</div>
      ${rows}
      <div style="padding:16px"><button class="btn-primary" onclick="closeTopSheet()">Done</button></div>
    </div>`);
}
function toggleAnalyticsCat(id) {
  const hidden = analyticsHidden();
  hidden.has(id) ? hidden.delete(id) : hidden.add(id);
  S.settings.analyticsHiddenCats = [...hidden];
  saveState();
  const row = document.querySelector(`#sheet-analytics-catfilter [data-catfilter="${CSS.escape(id)}"]`);
  if (row) { const h=hidden.has(id); row.style.opacity=h?'.45':'1'; const ic=row.querySelector('.catfilter-icon'); if(ic) ic.textContent=h?'🙈':'👁️'; }
  renderAnalyticsContent();
}
function getDateRange(range) {
  const now = new Date();
  const end = new Date(now); end.setHours(23,59,59,999);
  let start;
  // Calendar-month ranges: 1M/3M/6M/1Y start on the 1st of the month N-1 months back
  // (so "1M" is "this month so far", not a rolling 30-day window) and run through today.
  const monthsBack = {'1M':0, '3M':2, '6M':5, '1Y':11}[range];
  if (monthsBack !== undefined) {
    start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  } else {
    start = new Date(now);
    // "All" = since the user's first transaction. A fixed year-2000 floor would make the heatmap
    // render hundreds of empty month columns (and the charts hundreds of points) for anyone with
    // only recent data. Fall back to today when there are no transactions.
    const earliest = (S.transactions||[]).reduce((min,t)=> t.date < min ? t.date : min, end.toISOString().slice(0,10));
    start.setTime(new Date(earliest + 'T00:00:00').getTime());
  }
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
// Human-readable dates the current range spans, shown under the chips so "1M" etc. are unambiguous.
function analyticsRangeCaption(range) {
  const {start, end} = getDateRange(range);
  const fmtDay = d => d.toLocaleDateString(undefined, {day:'numeric', month:'short'});
  const fmtFull = d => d.toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});
  if (range === 'All') {
    return S.transactions.length ? `Since ${fmtFull(start)}` : 'All time';
  }
  return `${fmtDay(start)} – ${fmtFull(end)}`;
}
function renderAnalytics() {
  const el = document.getElementById('tab-analytics');
  const ranges = ['1M','3M','6M','1Y','All'];
  el.innerHTML = `
    <div class="range-sel">
      ${ranges.map(r=>`<button class="range-btn${_analyticsRange===r?' active':''}" onclick="setAnalyticsRange('${r}')">${r}</button>`).join('')}
    </div>
    <div id="analytics-range-caption" class="range-caption">${escHtml(analyticsRangeCaption(_analyticsRange))}</div>
    <div style="display:flex;justify-content:flex-end;padding:0 16px 2px">
      <button onclick="openAnalyticsLayout()" style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:5px;padding:4px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/></svg>
        Reorder sections
      </button>
    </div>
    <div id="analytics-content"></div>`;
  renderAnalyticsContent();
}
function setAnalyticsRange(r) {
  _analyticsRange=r;
  document.querySelectorAll('#tab-analytics .range-btn').forEach(b => b.classList.toggle('active', b.textContent.trim()===r));
  const cap = document.getElementById('analytics-range-caption');
  if (cap) cap.textContent = analyticsRangeCaption(r);
  renderAnalyticsContent();
}
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
  // Totals + counts per category (shared by heatmap sort & breakdown), then filter hidden + sort.
  const catTotals = {}, catCounts = {};
  expTxs.forEach(t=>{ catTotals[t.category]=(catTotals[t.category]||0)+t.convertedAmount; catCounts[t.category]=(catCounts[t.category]||0)+1; });
  const hiddenCats = analyticsHidden();
  const activeCats = sortCategoryIds(Object.keys(catMonthData).filter(c=>!hiddenCats.has(c)), catTotals, catCounts);
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
        hmHtml += `<div class="hm-cell${v===0?' empty':''}" style="background:${bg}" onclick="openHeatmapDetail('${jsAttr(cat)}','${m}')">${lbl}</div>`;
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

  // === C: Category breakdown === (reuses catTotals/catCounts; same hidden filter + sort as heatmap)
  const catEntries = sortCategoryIds(Object.keys(catTotals).filter(c=>!hiddenCats.has(c)), catTotals, catCounts).map(c=>[c, catTotals[c]]);
  const catTotal = catEntries.reduce((s,[,v])=>s+v,0);
  const donutLabels = catEntries.map(([c])=>getCatInfo(c).name);
  const donutData2 = catEntries.map(([,v])=>v);
  const donutColors2 = catEntries.map(([c])=>getCatInfo(c).color);
  const catRows = catEntries.slice(0,8).map(([c,v])=>{
    const ci=getCatInfo(c);
    const pct=catTotal>0?Math.round(v/catTotal*100):0;
    return `<div class="legend-item" style="width:100%;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)" onclick="filterByCategory('${jsAttr(c)}')">
      <div style="display:flex;align-items:center;gap:8px"><div class="legend-dot" style="background:${ci.color}"></div><span>${ci.emoji} ${escHtml(ci.name)}</span></div>
      <div style="display:flex;align-items:center;gap:12px"><span style="color:var(--text-tertiary)">${pct}%</span><span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-variant-numeric:tabular-nums">${formatCurrency(v,dc,true)}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  }).join('');

  // === D: Top Merchants ===
  const merTotals={}, merCts={};
  expTxs.forEach(t=>{merTotals[t.merchant]=(merTotals[t.merchant]||0)+t.convertedAmount;merCts[t.merchant]=(merCts[t.merchant]||0)+1;});
  const topMers = sortMerchantEntries(Object.entries(merTotals), merCts).slice(0,8);
  const maxMer = Math.max(...topMers.map(([,a])=>a), 1);
  const merRows = topMers.map(([name,amt],i)=>`
    <div class="merchant-row" onclick="filterByMerchant('${jsAttr(name)}')">
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

  // Each section's HTML, keyed by id, so they can be emitted in the user's saved order.
  const sections = {
    heatmap: `<div class="analytics-sec" data-sec="heatmap">
      <div class="analytics-sec-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>📊 Spending Heatmap</span>
        <span style="display:flex;align-items:center;gap:6px">
          ${analyticsSortSelect('cats', [['amount','Amount'],['custom','My order'],['name','Name'],['count','Most used']])}
          <button onclick="openAnalyticsCategoryFilter()" title="Show / hide categories" style="background:var(--bg-elevated);border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">👁️</button>
        </span>
      </div>
      ${activeCats.length ? `<div class="chart-box"><div class="heatmap-outer">${hmHtml}</div></div>` : `<div class="chart-box" style="color:var(--text-secondary);font-size:14px;padding:24px;text-align:center">No expense data in this range</div>`}
    </div>`,
    trend: `<div class="analytics-sec" data-sec="trend">
      <div class="analytics-sec-title">📈 Spending Trend</div>
      <div class="chart-box"><div class="chart-inner"><canvas id="trend-chart"></canvas></div>
      <div class="chart-insight-txt">${escHtml(trendInsight)}</div></div>
    </div>`,
    breakdown: `<div class="analytics-sec" data-sec="breakdown">
      <div class="analytics-sec-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>🍩 Category Breakdown</span>
        ${analyticsSortSelect('cats', [['amount','Amount'],['custom','My order'],['name','Name'],['count','Most used']])}
      </div>
      <div class="chart-box">
        ${catEntries.length?`<div class="chart-inner"><canvas id="cat-donut"></canvas><div class="donut-center"><div class="donut-center-lbl">Total Spent</div><div class="donut-center-amt">${formatCurrency(catTotal,dc,true)}</div></div></div><div>${catRows}</div>`:
          `<div style="color:var(--text-secondary);font-size:14px;text-align:center;padding:16px">No data</div>`}
      </div>
    </div>`,
    merchants: `<div class="analytics-sec" data-sec="merchants">
      <div class="analytics-sec-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>🏪 Top Merchants</span>
        ${analyticsSortSelect('merchants', [['amount','Amount'],['name','Name'],['count','Most used']])}
      </div>
      <div class="chart-box">${topMers.length?merRows:`<div style="color:var(--text-secondary);font-size:14px;text-align:center;padding:16px">No data</div>`}</div>
    </div>`,
    incexp: hasIncome?`<div class="analytics-sec" data-sec="incexp">
      <div class="analytics-sec-title">💵 Income vs Expense</div>
      <div class="chart-box"><div class="chart-inner"><canvas id="inc-exp-chart"></canvas></div></div>
    </div>`:''
  };
  el.innerHTML = currentAnalyticsOrder().map(id => sections[id]||'').join('') + `<div style="height:16px"></div>`;

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
// The current Analytics range as a transactions date-filter (null for "All" = no scoping).
function analyticsRangeFilter() {
  if (_analyticsRange === 'All') return null;
  const {start, end} = getDateRange(_analyticsRange);
  const labels = {'1M':'This month','3M':'Last 3 months','6M':'Last 6 months','1Y':'Last year'};
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10), label: labels[_analyticsRange] || _analyticsRange };
}
function filterByMerchant(name) {
  _txSearch=name; _txFilter='all'; _txPage=1;
  _txDateFilter = analyticsRangeFilter(); // honor the selected range, don't show all-time
  switchTab('transactions');
  _tabsInit['transactions']=true; renderTransactions();
}
function filterByCategory(catId) {
  _txSearch=''; _txFilter='cat:'+catId; _txPage=1;
  _txDateFilter = analyticsRangeFilter(); // honor the selected range, don't show all-time
  switchTab('transactions');
  _tabsInit['transactions']=true; renderTransactions();
}

