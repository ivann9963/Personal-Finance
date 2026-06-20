// === ACCOUNTS ===

// Apply a manual account-to-account transfer to the two account balances. Pass reverse=true to undo.
// Vault accounts are intentionally skipped here: their balance is *derived* (openingBalance + flows)
// and refreshed via recomputeVaultBalances(), which already counts transfers touching the vault.
// Mutating a vault directly would be double-counted and then clobbered on the next recompute.
function applyTransferBalances(tx, reverse) {
  const fromAcc = S.accounts.find(a=>a.id===tx.accountId);
  const toAcc   = S.accounts.find(a=>a.id===tx.toAccountId);
  if (!fromAcc || !toAcc) return;
  const sign = reverse ? 1 : -1;
  const inCurrencyOf = acc => (tx.originalCurrency === acc.currency)
    ? tx.originalAmount
    : Math.round(tx.originalAmount * (getRate(tx.originalCurrency, acc.currency) || 1));
  if (!fromAcc.isVault) fromAcc.balance += sign * inCurrencyOf(fromAcc);
  if (!toAcc.isVault)   toAcc.balance   -= sign * inCurrencyOf(toAcc);
}

function renderAccounts() {
  const el = document.getElementById('tab-accounts');
  const dc = S.settings.defaultCurrency;
  let assets=0, liabilities=0;
  S.accounts.forEach(a=>{
    const c=defaultConvert(a.balance,a.currency);
    const v=c.ok?c.amount:0;
    if (a.type==='credit') liabilities+=Math.abs(v); else assets+=v;
  });
  const netWorth = assets - liabilities;
  const accTypeInfo = id => ACCOUNT_TYPES.find(t=>t.id===id)||{emoji:'📁'};
  const cards = S.accounts.map(a=>{
    const ati = accTypeInfo(a.type);
    const c = defaultConvert(a.balance, a.currency);
    const isLiability = a.type==='credit';
    const showConv = a.currency !== dc;
    let sub = escHtml(a.institution||ACCOUNT_TYPES.find(t=>t.id===a.type)?.name||a.type);
    if (a.isVault) {
      const ru = S.transactions.filter(t=>t.savingsVault===a.vaultName && t.isRoundup).length;
      sub = `🐷 Auto-saved${ru?` · ${ru} round-ups`:''}`;
    }
    const goalBar = a.goalAmount ? goalProgressHTML(a.balance, a.goalAmount, a.currency, true) : '';
    return `<div class="account-card" onclick="openAccDetail('${a.id}')">
      <div class="acc-icon" style="background:var(--bg-elevated)">${a.isVault?'🐷':ati.emoji}</div>
      <div class="acc-info">
        <div class="acc-name">${escHtml(a.name)}</div>
        <div class="acc-sub">${sub}</div>
        ${goalBar}
      </div>
      <div class="acc-bal">
        <div class="acc-bal-main${isLiability?' liability':''}">${formatCurrency(Math.abs(a.balance),a.currency)}</div>
        ${showConv&&c.ok?`<div class="acc-bal-sub">${formatCurrency(Math.abs(c.amount),dc)}</div>`:''}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="acc-summary">
      <div class="acc-sum-card"><div class="acc-sum-lbl">Assets</div><div class="acc-sum-val pos">${formatCurrency(assets,dc,true)}</div></div>
      <div class="acc-sum-card"><div class="acc-sum-lbl">Liabilities</div><div class="acc-sum-val neg">${formatCurrency(liabilities,dc,true)}</div></div>
      <div class="acc-sum-card"><div class="acc-sum-lbl">Net Worth</div><div class="acc-sum-val ${netWorth>=0?'pos':'neg'}">${formatCurrency(netWorth,dc,true)}</div></div>
    </div>
    ${cards||`<div class="empty-state"><div style="font-size:40px;margin-bottom:12px">🏦</div><div class="empty-state-title">No accounts</div><div class="empty-state-desc">Add your bank accounts and cards to track your finances</div></div>`}
    <button class="add-acc-btn" onclick="openAddAccountSheet()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Account
    </button>`;
}
function goalProgressHTML(balance, goalAmount, currency, compact=false) {
  const pct = Math.min(100, Math.round(Math.abs(balance) / goalAmount * 100));
  const fill = pct >= 100 ? 'green-fill' : pct >= 50 ? 'green-fill' : 'amber-fill';
  if (compact) {
    return `<div style="margin-top:6px">
      <div class="progress-bar" style="margin-bottom:3px"><div class="progress-fill ${fill}" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--text-tertiary)">${formatCurrency(Math.abs(balance),currency)} / ${formatCurrency(goalAmount,currency)} · ${pct}%</div>
    </div>`;
  }
  const remaining = Math.max(0, goalAmount - Math.abs(balance));
  return `<div style="background:var(--bg-elevated);border-radius:var(--radius);padding:14px;margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <span style="font-size:13px;font-weight:600">Savings Goal</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text-secondary)">${pct}%</span>
    </div>
    <div class="progress-bar"><div class="progress-fill ${fill}" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--text-tertiary)">
      <span>${formatCurrency(Math.abs(balance),currency)} saved</span>
      <span>${pct<100?`${formatCurrency(remaining,currency)} to go`:'🎉 Goal reached!'}</span>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;text-align:right">of ${formatCurrency(goalAmount,currency)}</div>
  </div>`;
}
function openAccDetail(id) {
  const acc = S.accounts.find(a=>a.id===id); if (!acc) return;
  const ati = ACCOUNT_TYPES.find(t=>t.id===acc.type)||{emoji:'📁',name:'Account'};
  const dc = S.settings.defaultCurrency;
  const c = defaultConvert(acc.balance, acc.currency);
  // Include transfers landing in this account (toAccountId) so incoming money is visible here too.
  const txs = S.transactions.filter(t=>t.accountId===id || t.toAccountId===id).slice(0,20);
  const txRows = txs.map(t=>txRowHTML(t)).join('');
  const goalSection = acc.goalAmount ? goalProgressHTML(acc.balance, acc.goalAmount, acc.currency, false) : '';
  openSheet('acc-detail',`
    <div class="sheet-handle"></div>
    <div class="sheet-body" style="padding-top:16px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div class="acc-icon" style="background:var(--bg-elevated);width:56px;height:56px;font-size:26px">${acc.isVault?'🐷':ati.emoji}</div>
        <div>
          <div style="font-size:20px;font-weight:700">${escHtml(acc.name)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${escHtml(acc.institution||ati.name)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:${acc.type==='credit'?'var(--red)':'var(--green)'}">${formatCurrency(acc.balance,acc.currency)}</div>
          ${acc.currency!==dc&&c.ok?`<div style="font-size:12px;color:var(--text-tertiary);font-family:'JetBrains Mono',monospace">${formatCurrency(c.amount,dc)}</div>`:''}
        </div>
      </div>
      ${goalSection}
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn-secondary" style="flex:1" onclick="openEditAccountSheet('${id}')">Edit</button>
        <button class="btn-danger" style="flex:1" onclick="deleteAccount('${id}');closeTopSheet()">Delete</button>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Recent Transactions</div>
      ${txRows||`<div style="color:var(--text-secondary);font-size:14px;padding:16px 0">No transactions</div>`}
    </div>`);
}
function openAddAccountSheet(prefill={}) {
  const typeOpts = ACCOUNT_TYPES.map(t=>`<option value="${t.id}"${prefill.type===t.id?' selected':''}>${t.emoji} ${t.name}</option>`).join('');
  const curOpts  = CURRENCIES.map(c=>`<option value="${c.code}"${(prefill.currency||S.settings.defaultCurrency)===c.code?' selected':''}>${c.code} — ${c.name}</option>`).join('');
  openSheet('add-acc',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">${prefill.id?'Edit Account':'Add Account'}</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Account Name</label>
        <input id="acc-name" class="form-input" type="text" placeholder="e.g. Main Checking" value="${escHtml(prefill.name||'')}"></div>
      <div class="form-field"><label class="form-label">Type</label>
        <select id="acc-type" class="form-input">${typeOpts}</select></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">${prefill.isVault?'Actual Balance':'Balance'}</label>
          <input id="acc-balance" class="form-input mono" type="number" inputmode="decimal" placeholder="0.00" value="${prefill.balance!=null?(prefill.balance/100).toFixed(2):''}"></div>
        <div class="form-field"><label class="form-label">Currency</label>
          <select id="acc-currency" class="form-input">${curOpts}</select></div>
      </div>
      ${prefill.isVault?`<div style="font-size:12px;color:var(--text-tertiary);margin:-6px 0 12px;line-height:1.4">💡 Set the real current balance from your bank. Future imported deposits/withdrawals adjust it automatically from here.</div>`:''}
      <div class="form-field"><label class="form-label">Institution (optional)</label>
        <input id="acc-institution" class="form-input" type="text" placeholder="e.g. Revolut" value="${escHtml(prefill.institution||'')}"></div>
      <div class="form-field"><label class="form-label">Savings Goal (optional)</label>
        <input id="acc-goal" class="form-input mono" type="number" inputmode="decimal" placeholder="e.g. 5000.00" value="${prefill.goalAmount?(prefill.goalAmount/100).toFixed(2):''}"></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveAccount('${prefill.id||''}')">Save Account</button>
    </div>`);
}
function openEditAccountSheet(id) {
  const acc = S.accounts.find(a=>a.id===id); if (!acc) return;
  openAddAccountSheet({...acc});
}
function saveAccount(editId) {
  const name = document.getElementById('acc-name').value.trim();
  const type = document.getElementById('acc-type').value;
  const balStr = document.getElementById('acc-balance').value;
  const currency = document.getElementById('acc-currency').value;
  const institution = document.getElementById('acc-institution').value.trim();
  const goalStr = document.getElementById('acc-goal')?.value;
  const goalAmount = goalStr && parseFloat(goalStr) > 0 ? Math.round(parseFloat(goalStr)*100) : null;
  if (!name) { showToast('Enter account name','error'); return; }
  const balance = isNaN(parseFloat(balStr)) ? 0 : Math.round(parseFloat(balStr)*100);
  const c = defaultConvert(balance, currency);
  if (editId) {
    const idx = S.accounts.findIndex(a=>a.id===editId);
    if (idx>=0) {
      const prev = S.accounts[idx];
      // For auto-managed vaults the typed balance is the REAL current balance: store it as an
      // opening offset (= balance − imported flows) so future imports stay reconciled.
      const openingBalance = prev.isVault ? (balance - vaultNetFlows(prev.vaultName)) : prev.openingBalance;
      S.accounts[idx]={...prev, name, type, balance, currency, institution, convertedBalance:c.ok?c.amount:balance, openingBalance, goalAmount};
    }
  } else {
    S.accounts.push({id:gid(), name, type, balance, currency, institution, convertedBalance:c.ok?c.amount:balance, goalAmount});
  }
  saveState(); closeTopSheet(); renderCurrentTab(); // net worth + insights live on other tabs
  showToast(`Account ${editId?'updated':'added'}`,'success');
}
function deleteAccount(id) {
  if (!confirm('Delete this account? Transactions will be kept.')) return;
  S.accounts = S.accounts.filter(a=>a.id!==id);
  saveState(); renderCurrentTab(); // net worth + insights live on other tabs
  showToast('Account deleted','success');
}

