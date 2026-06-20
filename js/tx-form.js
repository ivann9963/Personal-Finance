// === ADD / EDIT TRANSACTION SHEET ===
let _txForm = {type:'expense', category:'food', currency:null, accountId:null, toAccountId:null, recurring:false};

function openAddTxSheet(prefill={}) {
  const firstAccId  = S.accounts[0]?.id || '';
  const secondAccId = S.accounts.find(a=>a.id !== (prefill.accountId||firstAccId))?.id || firstAccId;
  _txForm = {
    type: prefill.type||'expense',
    category: prefill.category||'food',
    currency: prefill.originalCurrency||S.settings.defaultCurrency,
    accountId: prefill.accountId||firstAccId,
    toAccountId: prefill.toAccountId||secondAccId,
    recurring: false,
    editId: prefill.id||null
  };
  buildTxSheet(prefill);
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
  const catPills = S.categories.map(c=>`
    <div class="cat-pill${_txForm.category===c.id?' sel':''}" data-catid="${c.id}" onclick="selectTxCat('${c.id}')">
      <div class="cat-pill-emoji">${c.emoji}</div>
      <div class="cat-pill-name">${escHtml(c.name)}</div>
    </div>`).join('')
    + `<div class="cat-pill" style="border-style:dashed" onclick="addTxCategoryInline()">
        <div class="cat-pill-emoji">＋</div><div class="cat-pill-name">New</div></div>`;
  const showRate = _txForm.currency !== dc;
  const storedRate = S.exchangeRates[`${_txForm.currency}_${dc}`] || S.exchangeRates[`${dc}_${_txForm.currency}`];
  const rateVal = storedRate ? (S.exchangeRates[`${_txForm.currency}_${dc}`]?storedRate:(1/storedRate).toFixed(6)) : '';
  const content = `
    <div class="sheet-handle"></div>
    <div class="sheet-body" style="padding-top:12px">
      <div class="type-seg">
        <button class="type-seg-btn${_txForm.type==='expense'?' active expense':''}" onclick="setTxType('expense')">Expense</button>
        <button class="type-seg-btn${_txForm.type==='income'?' active income':''}" onclick="setTxType('income')">Income</button>
        <button class="type-seg-btn${_txForm.type==='transfer'?' active transfer':''}" onclick="setTxType('transfer')">Transfer</button>
      </div>
      <div class="amt-wrap">
        <button class="amt-cur-btn" onclick="openCurrencyPicker('${_txForm.currency}',setTxCurrency)">${curInfo.symbol} <span style="font-size:12px;opacity:.7">${_txForm.currency}</span></button>
        <input id="tx-amount" class="amt-input ${_txForm.type}" type="text" inputmode="decimal" placeholder="0.00" value="${prefill.originalAmount?(prefill.originalAmount/100).toFixed(2):''}">
      </div>
      ${showRate?`<div class="rate-row">Rate: 1 ${_txForm.currency} = <input id="tx-rate" class="rate-input" type="number" inputmode="decimal" placeholder="…" value="${escHtml(String(rateVal))}"> ${dc}</div>`:''}
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
  _txForm.type = type;
  if (type === 'transfer' && !_txForm.toAccountId) {
    _txForm.toAccountId = S.accounts.find(a=>a.id!==_txForm.accountId)?.id || S.accounts[0]?.id || '';
  }
  buildTxSheet(collectTxFormValues(), true);
}
function setTxCurrency(code) { _txForm.currency=code; buildTxSheet(collectTxFormValues(), true); }
function selectTxCat(id) {
  _txForm.category = id;
  document.querySelectorAll('.cat-pill').forEach(p => {
    p.classList.toggle('sel', p.dataset.catid === id);
  });
}
function addTxCategoryInline() {
  // Opens the category editor on top of the tx sheet; on save, select it and refresh in place.
  openCategoryEditor(null, (newId) => {
    _txForm.category = newId;
    buildTxSheet(collectTxFormValues(), true);
  });
}
function toggleRecurring() { _txForm.recurring=!_txForm.recurring; buildTxSheet(collectTxFormValues(), true); }
function collectTxFormValues() {
  const rawAmt = (document.getElementById('tx-amount')?.value||'').replace(/,/g,'');
  const toAccId = document.getElementById('tx-to-account')?.value;
  if (toAccId) _txForm.toAccountId = toAccId; // keep in sync for rebuilds
  return {
    originalAmount: parseFloat(rawAmt)*100 || undefined,
    originalCurrency: _txForm.currency,
    merchant: document.getElementById('tx-merchant')?.value||'',
    date: document.getElementById('tx-date')?.value||new Date().toISOString().slice(0,10),
    note: document.getElementById('tx-note')?.value||'',
    accountId: document.getElementById('tx-account')?.value||_txForm.accountId,
    toAccountId: toAccId || _txForm.toAccountId,
    id: _txForm.editId
  };
}
function saveTx() {
  const amtStr = (document.getElementById('tx-amount')?.value||'').replace(/,/g,'');
  const merchant = document.getElementById('tx-merchant')?.value?.trim()||'';
  const date = document.getElementById('tx-date')?.value;
  const note = document.getElementById('tx-note')?.value?.trim()||'';
  const accountId = document.getElementById('tx-account')?.value||S.accounts[0]?.id||'';
  const toAccountId = document.getElementById('tx-to-account')?.value||'';
  const rateInput = document.getElementById('tx-rate');
  const isTransfer = _txForm.type === 'transfer';
  if (!amtStr || isNaN(parseFloat(amtStr)) || parseFloat(amtStr)<=0) { showToast('Enter an amount','error'); return; }
  if (!isTransfer && !merchant) { showToast('Enter a merchant','error'); return; }
  if (isTransfer) {
    if (!accountId || !toAccountId) { showToast('Select both accounts','error'); return; }
    if (accountId === toAccountId) { showToast('Source and destination must be different','error'); return; }
  }
  const cents = Math.round(parseFloat(amtStr)*100);
  const dc = S.settings.defaultCurrency;
  let rate=1, convertedAmount=cents;
  if (_txForm.currency !== dc) {
    if (rateInput?.value) {
      rate = parseFloat(rateInput.value)||1;
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

