// === TRANSACTIONS ===
function renderTransactions() {
  const el = document.getElementById('tab-transactions');
  const accOpts = S.accounts.map(a=>`<button class="filter-chip${_txFilter===a.id?' active':''}" onclick="setTxFilter('${a.id}')">${escHtml(a.name)}</button>`).join('');
  el.innerHTML = `
    <div class="tx-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" placeholder="Search transactions…" value="${escHtml(_txSearch)}" oninput="setTxSearch(this.value)" autocomplete="off" inputmode="search">
    </div>
    <div class="filter-chips">
      <button class="filter-chip${_txFilter==='all'?' active':''}" onclick="setTxFilter('all')">All</button>
      <button class="filter-chip${_txFilter==='expense'?' active':''}" onclick="setTxFilter('expense')">Expenses</button>
      <button class="filter-chip${_txFilter==='income'?' active':''}" onclick="setTxFilter('income')">Income</button>
      <button class="filter-chip${_txFilter==='transfer'?' active':''}" onclick="setTxFilter('transfer')">Transfers</button>
      ${accOpts}
    </div>
    <div id="tx-list-body"></div>`;
  renderTxList();
}
function setTxFilter(f) { _txDateFilter=null; _txFilter=f; _txPage=1; renderTransactions(); } // tapping a chip = fresh manual filter, all dates
function setTxSearch(v) { _txSearch=v; _txPage=1; renderTxList(); }
function clearTxDrill() { _txFilter='all'; _txSearch=''; _txDateFilter=null; _txPage=1; renderTransactions(); }
function filterByTag(tag) { _txFilter='tag:'+tag; _txSearch=''; _txDateFilter=null; _txPage=1; switchTab('transactions'); _tabsInit['transactions']=true; renderTransactions(); }
function renderTxList() {
  const body = document.getElementById('tx-list-body'); if (!body) return;
  let txs = [...S.transactions];
  // Filter
  const catFilterId = _txFilter.startsWith('cat:') ? _txFilter.slice(4) : null;
  const tagFilterId = _txFilter.startsWith('tag:') ? _txFilter.slice(4) : null;
  if (catFilterId) txs=txs.filter(t=>t.category===catFilterId);
  else if (tagFilterId) txs=txs.filter(t=>(t.tags||[]).some(tg=>tg.toLowerCase()===tagFilterId.toLowerCase()));
  else if (_txFilter==='expense'||_txFilter==='income'||_txFilter==='transfer') txs=txs.filter(t=>t.type===_txFilter);
  else if (_txFilter!=='all') txs=txs.filter(t=>t.accountId===_txFilter);
  // Search (matches merchant, note, tags, category name)
  if (_txSearch) {
    const q = _txSearch.toLowerCase();
    txs = txs.filter(t => t.merchant.toLowerCase().includes(q)||
      (t.note||'').toLowerCase().includes(q)||
      (t.tags||[]).some(tg=>tg.toLowerCase().includes(q))||
      (getCatInfo(t.category).name||'').toLowerCase().includes(q));
  }
  // Date range (set by drill-downs like Analytics so the list matches the selected period)
  if (_txDateFilter) txs = txs.filter(t => t.date >= _txDateFilter.start && t.date <= _txDateFilter.end);
  const total = txs.length;
  txs = txs.slice(0, _txPage*50);
  // Group by day
  const groups = {};
  txs.forEach(t => { (groups[t.date]=groups[t.date]||[]).push(t); });
  const days = Object.keys(groups).sort((a,b)=>b.localeCompare(a));
  const dc = S.settings.defaultCurrency;
  const drillActive = catFilterId || tagFilterId || _txDateFilter;
  const filterBanner = drillActive ? (() => {
    const bits = [];
    if (catFilterId) { const ci = getCatInfo(catFilterId); bits.push(`${ci.emoji} ${escHtml(ci.name)}`); }
    else if (tagFilterId) bits.push(`#${escHtml(tagFilterId)}`);
    else if (_txSearch) bits.push(`“${escHtml(_txSearch)}”`);
    if (_txDateFilter) bits.push(escHtml(_txDateFilter.label));
    return `<div class="filter-banner">${bits.join(' · ')} · ${total} ${total===1?'transaction':'transactions'}<button onclick="clearTxDrill()">✕ Clear</button></div>`;
  })() : '';
  if (!days.length) {
    const isBlank = !_txSearch && _txFilter === 'all' && S.transactions.length === 0;
    body.innerHTML = filterBanner + (isBlank
      ? `<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">💸</div><div class="empty-state-title">No transactions yet</div><div class="empty-state-desc">Tap the + button to record your first transaction</div><button class="empty-state-btn" onclick="openAddTxSheet()">Add Transaction</button></div>`
      : `<div class="empty-state"><div style="font-size:40px;margin-bottom:12px">🔍</div><div class="empty-state-title">No results</div><div class="empty-state-desc">Try a different search or filter</div></div>`);
    return;
  }
  let html = filterBanner;
  days.forEach(day => {
    const dayTx = groups[day];
    const net = dayTx.reduce((s,t)=>t.type==='income'?s+t.convertedAmount:t.type==='expense'?s-t.convertedAmount:s, 0);
    const isToday = day === new Date().toISOString().slice(0,10);
    const isYest  = day === new Date(Date.now()-864e5).toISOString().slice(0,10);
    const dayLbl  = isToday?'Today':isYest?'Yesterday':formatDate(day,{weekday:'short',month:'short',day:'numeric'});
    html += `<div class="tx-day-hdr"><span class="tx-day-label">${dayLbl}</span><span class="tx-day-net" style="color:${net>0?'var(--green)':net<0?'var(--red)':'var(--text-tertiary)'}">${net>0?'+':''}${formatCurrency(net,dc)}</span></div>`;
    dayTx.forEach(t => { html += txRowHTML(t); });
  });
  if (total > _txPage*50) {
    html += `<button class="load-more-btn" onclick="loadMoreTx()">Load more (${total - _txPage*50} remaining)</button>`;
  }
  body.innerHTML = html;
  // Setup swipe + long press — pass the wrapper (.tx-row-wrap), not the inner row
  document.querySelectorAll('#tx-list-body .tx-row-wrap').forEach(wrap => {
    setupSwipeTx(wrap);
    setupLongPressTx(wrap);
  });
}
function loadMoreTx() { _txPage++; renderTxList(); }
function txRowHTML(tx) {
  const ci = getCatInfo(tx.category);
  const dc = S.settings.defaultCurrency;
  const showConv = tx.originalCurrency !== dc;
  const sign = tx.type==='income'?'+':tx.type==='expense'?'-':''; // explicit −; matches day totals
  const isTransfer = tx.type === 'transfer';
  const fromAcc = isTransfer ? S.accounts.find(a=>a.id===tx.accountId) : null;
  const toAcc   = isTransfer ? S.accounts.find(a=>a.id===tx.toAccountId) : null;
  const iconHtml = isTransfer
    ? `<div class="tx-cat-icon" style="background:var(--accent-bg);font-size:18px">⇄</div>`
    : `<div class="tx-cat-icon" style="background:${ci.color}22">${ci.emoji}</div>`;
  const metaHtml = isTransfer
    ? `<span class="tx-cat-tag">${escHtml(fromAcc?.name||'?')} → ${escHtml(toAcc?.name||'?')}</span>`
    : `<span class="tx-cat-tag">${escHtml(ci.name)}</span>
       ${showConv?`<span class="tx-cur-badge">${tx.originalCurrency}</span>`:''}
       ${tx.isRecurring?`<span class="tx-cur-badge" style="background:var(--accent-bg);color:var(--accent)">↻</span>`:''}`;
  return `<div class="tx-row-wrap">
    <div class="tx-swipe-btns">
      <button class="tx-swipe-btn edit-btn" onclick="openEditTxSheet('${tx.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button class="tx-swipe-btn del-btn" onclick="deleteTx('${tx.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Delete
      </button>
    </div>
    <div class="tx-row" data-txid="${tx.id}" onclick="openTxDetail('${tx.id}')">
      ${iconHtml}
      <div class="tx-info">
        <div class="tx-merchant">${escHtml(tx.merchant)}</div>
        <div class="tx-meta">${metaHtml}${(tx.tags||[]).slice(0,3).map(tg=>`<span class="tx-tag">#${escHtml(tg)}</span>`).join('')}</div>
      </div>
      <div class="tx-amounts">
        <div class="tx-amt ${isTransfer?'':tx.type}">${sign}${formatCurrency(tx.originalAmount, tx.originalCurrency)}</div>
        ${showConv&&!isTransfer?`<div class="tx-amt-sub">${sign}${formatCurrency(tx.convertedAmount,dc)}</div>`:''}
      </div>
    </div>
  </div>`;
}
const TX_SWIPE_OPEN = 128; // px the row opens to reveal Edit + Delete
function setupSwipeTx(row) {
  let startX=0, startY=0, moved=false, decided=false, horiz=false, base=0;
  const inner = row.querySelector('.tx-row'); if (!inner) return;
  inner.addEventListener('touchstart', e=>{
    startX=e.touches[0].clientX; startY=e.touches[0].clientY; moved=false; decided=false; horiz=false;
    base = inner === _activeSwipeRow ? -TX_SWIPE_OPEN : 0; // continue from open state if already open
    if (_activeSwipeRow && _activeSwipeRow!==inner) resetSwipe(_activeSwipeRow);
  },{passive:true});
  inner.addEventListener('touchmove', e=>{
    const dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
    // Decide gesture direction once, from the first meaningful movement.
    if (!decided && (Math.abs(dx)>6 || Math.abs(dy)>6)) { decided=true; horiz=Math.abs(dx)>Math.abs(dy); }
    if (!horiz) return;
    moved=true;
    inner.classList.add('dragging'); // 1:1 finger tracking (no transition)
    let x = base + dx;
    if (x > 0) x = 0;                                  // can't pull past closed
    if (x < -TX_SWIPE_OPEN) x = -TX_SWIPE_OPEN - (Math.abs(x)-TX_SWIPE_OPEN)*0.35; // resistance past open
    inner.style.transform=`translateX(${x}px)`;
  },{passive:true});
  inner.addEventListener('touchend', ()=>{
    if (!moved) return;
    inner.classList.remove('dragging'); // re-enable the ease-out transition for the snap
    const x = parseFloat(inner.style.transform.replace('translateX(',''))||0;
    if (x < -TX_SWIPE_OPEN/2) { inner.style.transform=`translateX(-${TX_SWIPE_OPEN}px)`; _activeSwipeRow=inner; haptic('light'); }
    else resetSwipe(inner);
  });
}
function resetSwipe(el) { if(el){el.classList.remove('dragging');el.style.transform='';} if(_activeSwipeRow===el)_activeSwipeRow=null; }
function setupLongPressTx(row) {
  const inner = row.querySelector('.tx-row'); if (!inner) return;
  const txId = inner.dataset.txid;
  inner.addEventListener('touchstart', ()=>{
    _longPressTimer = setTimeout(()=>openQuickAction(txId), 500);
  },{passive:true});
  inner.addEventListener('touchend', ()=>clearTimeout(_longPressTimer));
  inner.addEventListener('touchmove', ()=>clearTimeout(_longPressTimer));
}
function deleteTx(id) {
  resetSwipe(_activeSwipeRow);
  const tx = S.transactions.find(t=>t.id===id);
  const wrap = document.querySelector(`[data-txid="${id}"]`)?.closest('.tx-row-wrap');
  if (wrap) wrap.classList.add('tx-sliding-out');
  setTimeout(()=>{
    S.transactions = S.transactions.filter(t=>t.id!==id);
    if (tx?.type==='transfer' && tx.toAccountId) {
      applyTransferBalances(tx, true);   // reverse the non-vault side
      recomputeVaultBalances();          // re-derive any vault side from the now-updated list
    }
    saveState(); renderCurrentTab();
    showToast('Transaction deleted','success');
  }, 280);
}
function duplicateTx(id) {
  const tx = S.transactions.find(t=>t.id===id); if (!tx) return;
  const copy = {...tx, id:gid(), date:new Date().toISOString().slice(0,10), isRecurring:false, recurringId:undefined};
  S.transactions.unshift(copy);
  if (copy.type==='transfer' && copy.toAccountId) {
    applyTransferBalances(copy, false);
    recomputeVaultBalances();
  }
  saveState(); renderCurrentTab();
  showToast('Transaction duplicated','success');
}

