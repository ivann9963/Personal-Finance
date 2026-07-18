// === ADD / EDIT TRANSACTION SHEET ===
let _txForm = {type:'expense', category:'food', currency:null, accountId:null, toAccountId:null, recurring:false};

function openAddTxSheet(prefill={}) {
  // Honor the user's "New transaction defaults" (Settings) for a brand-new entry; an explicit
  // prefill (edit, duplicate, drill-down) always wins over the saved default.
  const prefAccId = S.accounts.some(a=>a.id===S.settings.defaultAccountId) ? S.settings.defaultAccountId : null;
  const firstAccId  = prefAccId || S.accounts[0]?.id || '';
  const secondAccId = S.accounts.find(a=>a.id !== (prefill.accountId||firstAccId))?.id || firstAccId;
  const defaultType = prefill.id ? (prefill.type||'expense') : (prefill.type || S.settings.defaultTxType || 'expense');
  _txForm = {
    type: defaultType,
    category: prefill.category||'food',
    currency: prefill.originalCurrency||S.settings.defaultCurrency,
    accountId: prefill.accountId||firstAccId,
    toAccountId: prefill.toAccountId||secondAccId,
    recurring: prefill.recurring || false,
    editId: prefill.id||null
  };
  buildTxSheet(prefill);
}
// Direct entry point for "add a recurring payment" — opens the tx form already in recurring mode.
// (openSheet replaces any open primary sheet, so this works from the recurring manager too.)
function openAddRecurring() {
  openAddTxSheet({type:'expense', recurring:true});
}
function openEditTxSheet(id) {
  const tx = S.transactions.find(t=>t.id===id); if (!tx) return;
  openAddTxSheet(tx);
}
function buildTxSheet(prefill={}, isUpdate=false) {
  const dc = S.settings.defaultCurrency;
  const curInfo = getCurInfo(_txForm.currency);
  const isTransfer = _txForm.type === 'transfer';
  const accOpts   = S.accounts.map(a=>`<option value="${a.id}"${_txForm.accountId===a.id?' selected':''}>${escHtml(a.name)}</option>`).join('');
  const toAccOpts = S.accounts.map(a=>`<option value="${a.id}"${_txForm.toAccountId===a.id?' selected':''}>${escHtml(a.name)}</option>`).join('');
  // Show the most-used categories first (so the common ones need no scrolling); the full,
  // searchable set lives behind the "More" tile. Always keep the currently-selected one visible.
  const topCats = categoriesByUsage().slice(0, 8);
  if (_txForm.category && !topCats.some(c=>c.id===_txForm.category)) {
    const sel = S.categories.find(c=>c.id===_txForm.category);
    if (sel) topCats.unshift(sel);
  }
  const catPills = topCats.map(c=>`
    <div class="cat-pill${_txForm.category===c.id?' sel':''}" data-catid="${c.id}" onclick="selectTxCat('${c.id}')">
      <div class="cat-pill-emoji">${c.emoji}</div>
      <div class="cat-pill-name">${escHtml(c.name)}</div>
    </div>`).join('')
    + `<div class="cat-pill cat-pill--more" onclick="openTxCategoryPicker()">
        <div class="cat-pill-emoji">${CATPICK_GRID_ICON}</div><div class="cat-pill-name">More</div></div>`;
  const showRate = _txForm.currency !== dc;
  const storedRate = S.exchangeRates[`${_txForm.currency}_${dc}`] || S.exchangeRates[`${dc}_${_txForm.currency}`];
  const rateVal = storedRate ? (S.exchangeRates[`${_txForm.currency}_${dc}`]?storedRate:(1/storedRate).toFixed(6)) : '';
  const content = `
    <div class="sheet-handle"></div>
    <div class="sheet-body" style="padding-top:12px">
      <div class="type-seg">
        <div class="type-seg-ind ${_txForm.type}" style="transform:translateX(${({expense:0,income:1,transfer:2})[_txForm.type]*100}%)"></div>
        <button class="type-seg-btn${_txForm.type==='expense'?' active expense':''}" onclick="setTxType('expense')">Expense</button>
        <button class="type-seg-btn${_txForm.type==='income'?' active income':''}" onclick="setTxType('income')">Income</button>
        <button class="type-seg-btn${_txForm.type==='transfer'?' active transfer':''}" onclick="setTxType('transfer')">Transfer</button>
      </div>
      <div class="amt-wrap">
        <button class="amt-cur-btn" onclick="openCurrencyPicker('${_txForm.currency}',setTxCurrency)">${curInfo.symbol} <span style="font-size:12px;opacity:.7">${_txForm.currency}</span></button>
        <input id="tx-amount" class="amt-input ${_txForm.type}" type="text" inputmode="decimal" placeholder="0.00" value="${prefill.originalAmount?(prefill.originalAmount/100).toFixed(2):''}">
      </div>
      ${showRate?`<div class="rate-row">Rate: 1 ${_txForm.currency} = <input id="tx-rate" class="rate-input" type="text" inputmode="decimal" placeholder="…" value="${escHtml(String(rateVal))}"> ${dc}</div>`:''}
      ${!isTransfer?`<div class="form-field"><label class="form-label">Category</label>
        <div class="cat-scroll">${catPills}</div></div>`:''}
      <div class="form-field"><label class="form-label">${isTransfer?'Description (optional)':'Merchant / Description'}</label>
        <input id="tx-merchant" class="form-input" type="text" placeholder="${isTransfer?'e.g. Monthly savings':'e.g. Lidl'}" autocomplete="off" value="${escHtml(prefill.merchant||'')}"${!isTransfer?' list="merchant-list"':''}>
        ${!isTransfer?`<datalist id="merchant-list">${[...new Set(S.transactions.map(t=>t.merchant))].map(m=>`<option value="${escHtml(m)}">`).join('')}</datalist>`:''}
      </div>
      ${isTransfer?`
      <div class="form-row">
        <div class="form-field"><label class="form-label">Date</label>
          <input id="tx-date" class="form-input" type="date" value="${prefill.date||new Date().toISOString().slice(0,10)}"></div>
      </div>
      ${S.accounts.length<2
        ? `<div style="background:var(--bg-elevated);border-radius:var(--radius);padding:14px;font-size:13px;color:var(--text-secondary);line-height:1.4">💡 You need at least two accounts to move money between them. Add another account first.</div>`
        : `<div class="form-row">
        <div class="form-field"><label class="form-label">From</label><select id="tx-account" class="form-input">${accOpts}</select></div>
        <div class="form-field"><label class="form-label">To</label><select id="tx-to-account" class="form-input">${toAccOpts}</select></div>
      </div>`}`:`
      <div class="form-row">
        <div class="form-field"><label class="form-label">Date</label>
          <input id="tx-date" class="form-input" type="date" value="${prefill.date||new Date().toISOString().slice(0,10)}"></div>
        ${accOpts?`<div class="form-field"><label class="form-label">Account</label><select id="tx-account" class="form-input">${accOpts}</select></div>`:''}
      </div>
      <div class="form-field" style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
        <label style="font-size:14px;font-weight:600">Recurring</label>
        <div class="toggle${_txForm.recurring?' on':''}" id="recurring-toggle" onclick="toggleRecurring()"></div>
      </div>
      ${_txForm.recurring?`<div class="recurring-expand">
        <div class="form-field" style="margin-bottom:0"><label class="form-label">Frequency</label>
          <select id="tx-freq" class="form-input">
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option><option value="monthly" selected>Monthly</option>
            <option value="yearly">Yearly</option>
          </select></div></div>`:''}`}
      <div class="form-field"><label class="form-label">Note (optional)</label>
        <input id="tx-note" class="form-input" type="text" placeholder="Add a note…" value="${escHtml(prefill.note||'')}"></div>
      <div class="form-field"><label class="form-label">Tags (optional)</label>
        <input id="tx-tags" class="form-input" type="text" placeholder="e.g. holiday, work" value="${escHtml((prefill.tags||[]).join(', '))}" list="tag-list" autocomplete="off">
        <datalist id="tag-list">${[...new Set(S.transactions.flatMap(t=>t.tags||[]))].map(t=>`<option value="${escHtml(t)}">`).join('')}</datalist>
      </div>
    </div>
    <div class="sheet-footer">
      <button class="btn-primary" onclick="saveTx()">${_txForm.editId?'Update':'Add Transaction'}</button>
    </div>`;
  const sheetId = 'sheet-'+(_txForm.editId?'edit-tx':'add-tx');
  const existing = isUpdate && document.getElementById(sheetId);
  if (existing) {
    existing.innerHTML = content;
    setupSheetSwipe(existing, () => closeTopSheet());
    document.getElementById('tx-amount')?.focus();
    return;
  }
  openSheet(_txForm.editId?'edit-tx':'add-tx', content);
  setTimeout(()=>document.getElementById('tx-amount')?.focus(), 400);
}
function setTxType(type) {
  const prev = _txForm.type;
  _txForm.type = type;
  if (type === 'transfer' && !_txForm.toAccountId) {
    _txForm.toAccountId = S.accounts.find(a=>a.id!==_txForm.accountId)?.id || S.accounts[0]?.id || '';
  }
  // Transfer shows/hides fields (category, from/to), so it needs a rebuild. Expense↔Income keep
  // the same fields — update in place so the segment indicator can actually slide between them.
  if (type === 'transfer' || prev === 'transfer') { buildTxSheet(collectTxFormValues(), true); return; }
  const idx = {expense:0, income:1, transfer:2}[type];
  const ind = document.querySelector('.type-seg-ind');
  if (ind) { ind.style.transform = `translateX(${idx*100}%)`; ind.className = `type-seg-ind ${type}`; }
  document.querySelectorAll('.type-seg-btn').forEach((b,i)=>{
    b.classList.remove('active','expense','income','transfer');
    if (i===idx) b.classList.add('active', type);
  });
  const amt = document.getElementById('tx-amount');
  if (amt) amt.className = `amt-input ${type}`;
  haptic('light');
}
function setTxCurrency(code) { _txForm.currency=code; buildTxSheet(collectTxFormValues(), true); }
function selectTxCat(id) {
  _txForm.category = id;
  let selEl = null;
  document.querySelectorAll('.cat-pill').forEach(p => {
    const on = p.dataset.catid === id;
    p.classList.toggle('sel', on);
    if (on) selEl = p;
  });
  // Bring the chosen category into view so it's never hidden off-screen in the scroll row.
  if (selEl) selEl.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
  haptic('light');
}
function addTxCategoryInline() {
  // Opens the category editor on top of the tx sheet; on save, select it and refresh in place.
  openCategoryEditor(null, (newId) => {
    _txForm.category = newId;
    buildTxSheet(collectTxFormValues(), true);
  });
}
const CATPICK_GRID_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
// Categories ordered by how often the user has used them (most-used first), then the rest in their
// existing order. Drives the "top categories" shown up front in the transaction form.
function categoriesByUsage() {
  const counts = {};
  (S.transactions||[]).forEach(t => { if (t.category) counts[t.category] = (counts[t.category]||0)+1; });
  return S.categories.map((c,i)=>({c,i})).sort((a,b)=>(counts[b.c.id]||0)-(counts[a.c.id]||0) || a.i-b.i).map(x=>x.c);
}
// Full, searchable category grid — the escape hatch from the short "top categories" row.
function openTxCategoryPicker() {
  const tiles = categoriesByUsage().map(c=>`
    <button class="catpick-tile${_txForm.category===c.id?' sel':''}" data-name="${escHtml(c.name.toLowerCase())}" onclick="selectTxCatFromPicker('${jsAttr(c.id)}')">
      <span class="catpick-emoji" style="background:${c.color}22">${c.emoji}</span>
      <span class="catpick-name">${escHtml(c.name)}</span>
    </button>`).join('');
  openSheet2('cat-picker', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Choose category</div>
    <div class="sheet-body">
      <input id="catpick-search" class="form-input" type="text" placeholder="Search categories…" autocomplete="off" oninput="filterCatPicker(this.value)" style="margin-bottom:14px">
      <div class="catpick-grid" id="catpick-grid">${tiles}
        <button class="catpick-tile catpick-add" onclick="addCatFromPicker()"><span class="catpick-emoji" style="background:var(--bg-elevated)">＋</span><span class="catpick-name">New</span></button>
      </div>
      <div id="catpick-empty" class="catpick-empty" style="display:none">No categories match — <button class="link-btn" onclick="addCatFromPicker()">create one</button></div>
    </div>`);
  setTimeout(()=>document.getElementById('catpick-search')?.focus(), 350);
}
function filterCatPicker(q) {
  q = (q||'').trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('#catpick-grid .catpick-tile[data-name]').forEach(t => {
    const hit = !q || t.dataset.name.includes(q);
    t.style.display = hit ? '' : 'none';
    if (hit) shown++;
  });
  const add = document.querySelector('#catpick-grid .catpick-add');
  if (add) add.style.display = q ? 'none' : '';
  const empty = document.getElementById('catpick-empty');
  if (empty) empty.style.display = (q && shown===0) ? '' : 'none';
}
function selectTxCatFromPicker(id) {
  _txForm.category = id;
  closeTopSheet2();
  buildTxSheet(collectTxFormValues(), true);
  haptic('light');
}
function addCatFromPicker() {
  closeTopSheet2();               // close the picker first…
  addTxCategoryInline();          // …then open the category editor (rebuilds tx form on save)
}
function toggleRecurring() { _txForm.recurring=!_txForm.recurring; buildTxSheet(collectTxFormValues(), true); }
function collectTxFormValues() {
  const rawAmt = document.getElementById('tx-amount')?.value||'';
  const toAccId = document.getElementById('tx-to-account')?.value;
  if (toAccId) _txForm.toAccountId = toAccId; // keep in sync for rebuilds
  return {
    originalAmount: parseAmount(rawAmt)*100 || undefined,
    originalCurrency: _txForm.currency,
    merchant: document.getElementById('tx-merchant')?.value||'',
    date: document.getElementById('tx-date')?.value||new Date().toISOString().slice(0,10),
    note: document.getElementById('tx-note')?.value||'',
    tags: parseTags(document.getElementById('tx-tags')?.value||''),
    accountId: document.getElementById('tx-account')?.value||_txForm.accountId,
    toAccountId: toAccId || _txForm.toAccountId,
    id: _txForm.editId
  };
}
function saveTx() {
  const amt = parseAmount(document.getElementById('tx-amount')?.value||'');
  const merchant = document.getElementById('tx-merchant')?.value?.trim()||'';
  const date = document.getElementById('tx-date')?.value;
  const note = document.getElementById('tx-note')?.value?.trim()||'';
  const tags = parseTags(document.getElementById('tx-tags')?.value||'');
  const accountId = document.getElementById('tx-account')?.value||S.accounts[0]?.id||'';
  const toAccountId = document.getElementById('tx-to-account')?.value||'';
  const rateInput = document.getElementById('tx-rate');
  const isTransfer = _txForm.type === 'transfer';
  if (isNaN(amt) || amt<=0) { showToast('Enter an amount','error'); return; }
  if (!isTransfer && !merchant) { showToast('Enter a merchant','error'); return; }
  if (isTransfer) {
    if (!accountId || !toAccountId) { showToast('Select both accounts','error'); return; }
    if (accountId === toAccountId) { showToast('Source and destination must be different','error'); return; }
  }
  const cents = Math.round(amt*100);
  const dc = S.settings.defaultCurrency;
  let rate=1, convertedAmount=cents;
  if (_txForm.currency !== dc) {
    if (rateInput?.value) {
      rate = parseAmount(rateInput.value)||1;
      convertedAmount = Math.round(cents*rate);
      const k = `${_txForm.currency}_${dc}`;
      S.exchangeRates[k] = rate;
    } else {
      const r=getRate(_txForm.currency,dc);
      if (r) { rate=r; convertedAmount=Math.round(cents*r); }
      else convertedAmount = cents;
    }
  }
  const tx = {
    id: _txForm.editId||gid(), type:_txForm.type,
    originalAmount:cents, originalCurrency:_txForm.currency,
    convertedAmount, exchangeRate:rate,
    category: isTransfer ? 'other' : _txForm.category,
    merchant: isTransfer ? (merchant||'Transfer') : merchant,
    accountId, date, note,
    ...(tags.length && {tags}),
    ...(isTransfer && {toAccountId})
  };
  let wasTransfer = false;
  if (_txForm.editId) {
    const idx=S.transactions.findIndex(t=>t.id===_txForm.editId);
    if (idx>=0) {
      const oldTx = S.transactions[idx];
      wasTransfer = oldTx.type==='transfer' && !!oldTx.toAccountId;
      if (wasTransfer) applyTransferBalances(oldTx, true);
      S.transactions[idx]=tx;
    }
  } else {
    S.transactions.unshift(tx);
  }
  if (isTransfer) applyTransferBalances(tx, false);
  // Keep derived vault balances in sync whenever a transfer is involved (either side may be a vault).
  if (isTransfer || wasTransfer) recomputeVaultBalances();
  if (!isTransfer) learnMerchantCategory(merchant, tx.category);
  // Recurring schedule (not for transfers)
  if (!isTransfer && _txForm.recurring && !_txForm.editId) {
    const freq = document.getElementById('tx-freq')?.value||'monthly';
    S.recurringSchedules.push({id:gid(), type:tx.type, amount:cents, currency:_txForm.currency,
      convertedAmount, exchangeRate:rate, category:_txForm.category, merchant, accountId,
      frequency:freq, startDate:date, active:true, note});
    generateRecurring();
  }
  S.transactions.sort((a,b)=>b.date.localeCompare(a.date));
  saveState(); closeTopSheet(); renderCurrentTab();
  showToast(`Transaction ${_txForm.editId?'updated':'added'}`,'success');
  setTimeout(()=>{
    const row = document.querySelector(`[data-txid="${tx.id}"]`);
    if (row) row.classList.add(tx.type==='income'?'flash-green':'flash-red');
  }, 100);
}

