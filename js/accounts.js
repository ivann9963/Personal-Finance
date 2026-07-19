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
  // Money you move into/out of an investment is a contribution/withdrawal, not a market gain:
  // shift the cost basis with it so gain (= balance − costBasis) is unaffected by transfers.
  if (!fromAcc.isVault && fromAcc.type==='investment' && fromAcc.costBasis!=null) fromAcc.costBasis += sign * inCurrencyOf(fromAcc);
  if (!toAcc.isVault   && toAcc.type==='investment'   && toAcc.costBasis!=null)   toAcc.costBasis   -= sign * inCurrencyOf(toAcc);
}

// hex (#RRGGBB) → rgba() with the given alpha, for subtle account-color tints.
function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex||''); if (!m) return 'var(--bg-elevated)';
  const n = parseInt(m[1],16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
// The emoji shown for an account: custom emoji if set, else its type's emoji (vaults stay 🐷).
function accountEmoji(a) {
  if (a.isVault) return '🐷';
  return a.emoji || (ACCOUNT_TYPES.find(t=>t.id===a.type)?.emoji) || '📁';
}
// Inline style for an account icon circle — tinted with the account's color when set.
function accountIconStyle(a) {
  return a.color ? `background:${hexToRgba(a.color,0.18)}` : 'background:var(--bg-elevated)';
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
  const needRate = S.accounts.filter(accountNeedsRate);
  const accTypeInfo = id => ACCOUNT_TYPES.find(t=>t.id===id)||{emoji:'📁'};
  const cards = S.accounts.map((a,i)=>{
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
    const ig = a.type==='investment' ? investmentGain(a) : null;
    const gainLine = ig ? `<div style="font-size:12px;font-weight:600;margin-top:3px;color:${ig.gain>=0?'var(--green)':'var(--red)'}">${ig.gain>=0?'▲':'▼'} ${formatCurrency(Math.abs(ig.gain),a.currency)} · ${ig.pct>=0?'+':''}${ig.pct.toFixed(1)}%</div>` : '';
    return `<div class="account-card rise-in" style="animation-delay:${Math.min(i*45,270)}ms" onclick="openAccDetail('${a.id}')">
      <div class="acc-icon" style="${accountIconStyle(a)}">${accountEmoji(a)}</div>
      <div class="acc-info">
        <div class="acc-name">${escHtml(a.name)}</div>
        <div class="acc-sub">${sub}</div>
        ${gainLine}
        ${goalBar}
      </div>
      <div class="acc-bal">
        <div class="acc-bal-main${isLiability?' liability':''}">${formatCurrency(Math.abs(a.balance),a.currency)}</div>
        ${accountNeedsRate(a)
          ? `<div class="acc-rate-chip" onclick="event.stopPropagation();openSetRateSheet('${jsAttr(a.currency)}')">⚠️ Set rate</div>`
          : (showConv&&c.ok?`<div class="acc-bal-sub">${formatCurrency(Math.abs(c.amount),dc)}</div>`:'')}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="acc-summary">
      <div class="acc-sum-card"><div class="acc-sum-lbl">Assets</div><div class="acc-sum-val pos">${formatCurrency(assets,dc,true)}</div></div>
      <div class="acc-sum-card"><div class="acc-sum-lbl">Liabilities</div><div class="acc-sum-val neg">${formatCurrency(liabilities,dc,true)}</div></div>
      <div class="acc-sum-card"><div class="acc-sum-lbl">Net Worth</div><div class="acc-sum-val ${netWorth>=0?'pos':'neg'}">${formatCurrency(netWorth,dc,true)}</div></div>
    </div>
    ${needRate.length?`<div class="acc-rate-warn" onclick="openSetRateSheet('${jsAttr(needRate[0].currency)}')">
      <span>⚠️</span>
      <span><strong>${needRate.length} account${needRate.length>1?'s':''}</strong> not counted above — no ${escHtml(needRate[0].currency)}→${escHtml(dc)} exchange rate. Tap to set it.</span>
    </div>`:''}
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
  const invSection = acc.type==='investment' ? investmentSectionHTML(acc) : '';
  openSheet('acc-detail',`
    <div class="sheet-handle"></div>
    <div class="sheet-body" style="padding-top:16px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div class="acc-icon" style="${accountIconStyle(acc)};width:56px;height:56px;font-size:26px">${accountEmoji(acc)}</div>
        <div>
          <div style="font-size:20px;font-weight:700">${escHtml(acc.name)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${escHtml(acc.institution||ati.name)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:${acc.type==='credit'?'var(--red)':'var(--green)'}">${formatCurrency(acc.balance,acc.currency)}</div>
          ${acc.currency!==dc&&c.ok?`<div style="font-size:12px;color:var(--text-tertiary);font-family:'JetBrains Mono',monospace">${formatCurrency(c.amount,dc)}</div>`:''}
        </div>
      </div>
      ${invSection}
      ${goalSection}
      <div style="display:flex;gap:10px;margin-bottom:20px">
        ${acc.type==='investment'?((acc.holdings||[]).length
          ?`<button class="btn-primary" style="flex:1" onclick="openUpdatePricesSheet('${id}')">Update Prices</button>`
          :`<button class="btn-primary" style="flex:1" onclick="openUpdateValueSheet('${id}')">Update Value</button>`):''}
        <button class="btn-secondary" style="flex:1" onclick="openEditAccountSheet('${id}')">Edit</button>
        <button class="btn-danger" style="flex:1" onclick="deleteAccount('${id}');closeTopSheet()">Delete</button>
      </div>
      ${acc.type==='investment'?holdingsListHTML(acc):''}
      <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Recent Transactions</div>
      ${txRows||`<div style="color:var(--text-secondary);font-size:14px;padding:16px 0">No transactions</div>`}
    </div>`);
  if (acc.type==='investment' && (acc.valueHistory||[]).length>1) requestAnimationFrame(()=>{
    mkLine('invest-chart', acc.valueHistory.map(h=>formatDate(h.date)), [ // mkLine formats values as cents
      {label:'Value', data:acc.valueHistory.map(h=>h.value), borderColor:'#F0B429', backgroundColor:'rgba(240,180,41,.10)', fill:true, pointRadius:2, tension:.3, borderWidth:2},
    ]);
  });
}
// Invested vs current value vs gain for an investment account's detail sheet.
function investmentSectionHTML(acc) {
  const ig = investmentGain(acc);
  if (!ig) return '';
  const vh = acc.valueHistory||[];
  const updated = vh.length ? vh[vh.length-1].date : null;
  return `<div style="background:var(--bg-elevated);border-radius:var(--radius);padding:14px;margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:${vh.length>1?'10px':'2px'}">
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Invested</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px">${formatCurrency(acc.costBasis,acc.currency)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Gain / Loss</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;color:${ig.gain>=0?'var(--green)':'var(--red)'}">${ig.gain>=0?'+':''}${formatCurrency(ig.gain,acc.currency)} · ${ig.pct>=0?'+':''}${ig.pct.toFixed(1)}%</div>
      </div>
    </div>
    ${vh.length>1?`<div style="height:120px"><canvas id="invest-chart"></canvas></div>`:''}
    ${updated?`<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;text-align:right">value last updated ${formatDate(updated)}</div>`:''}
  </div>`;
}
// Record the account's real current value (from your broker app). Contributions are tracked
// separately via transfers, so this only moves the market-gain part.
function openUpdateValueSheet(id) {
  const acc = S.accounts.find(a=>a.id===id); if (!acc) return;
  openSheet2('update-value',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">Update Value</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
        Enter what <strong>${escHtml(acc.name)}</strong> is worth right now (check your broker app). Deposits and withdrawals are tracked by transfers — this records the market movement.
      </div>
      <div class="form-field"><label class="form-label">Current value (${escHtml(acc.currency)})</label>
        <input id="invest-value" class="form-input mono" type="text" inputmode="decimal" placeholder="0.00" value="${(acc.balance/100).toFixed(2)}"></div>
      <button class="btn-primary" onclick="saveInvestmentValue('${id}')">Save Value</button>
    </div>`);
}
function saveInvestmentValue(id) {
  const acc = S.accounts.find(a=>a.id===id); if (!acc) return;
  const v = parseAmount(document.getElementById('invest-value').value);
  if (isNaN(v)) { showToast('Enter the current value','error'); return; }
  const value = Math.round(v*100);
  acc.balance = value;
  const c = defaultConvert(value, acc.currency);
  acc.convertedBalance = c.ok ? c.amount : value;
  if (acc.costBasis == null) acc.costBasis = value; // first tracking point: gain starts at 0
  recordValuePoint(acc, value);
  saveState(); closeTopSheet2(); openAccDetail(id); renderCurrentTab();
  showToast('Value updated','success');
}
// --- Holdings UI (positions inside an investment account) ---
function holdingsListHTML(acc) {
  const rows = (acc.holdings||[]).map(h=>{
    const hg = holdingGain(h);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openHoldingSheet('${acc.id}','${h.id}')">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${escHtml(h.name)}</div>
        <div style="font-size:12px;color:var(--text-tertiary)">${h.qty} × ${formatCurrency(h.price,acc.currency)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px">${formatCurrency(holdingValue(h),acc.currency)}</div>
        ${hg?`<div style="font-size:11.5px;font-weight:600;color:${hg.gain>=0?'var(--green)':'var(--red)'}">${hg.gain>=0?'+':''}${formatCurrency(hg.gain,acc.currency)} · ${hg.pct>=0?'+':''}${hg.pct.toFixed(1)}%</div>`:''}
      </div>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
      <div style="font-size:13px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Holdings</div>
      ${hasLiveHoldings(acc.id)?`<button onclick="refreshHoldingPrices('${acc.id}')" style="font-size:12px;font-weight:600;color:var(--accent);display:flex;align-items:center;gap:4px">↻ Refresh prices</button>`:''}
    </div>
    ${rows||`<div style="font-size:13px;color:var(--text-secondary);padding:8px 0">Track individual positions (ETFs, stocks, crypto) — the account value follows their prices. Add a ticker to pull live prices.</div>`}
    <button class="btn-secondary" style="width:100%;margin-top:10px;padding:10px" onclick="openHoldingSheet('${acc.id}')">＋ Add holding</button>
  </div>`;
}
// Add or edit one position. Prices are per unit, in the ACCOUNT's currency.
function openHoldingSheet(accId, holdingId) {
  const acc = S.accounts.find(a=>a.id===accId); if (!acc) return;
  const h = (acc.holdings||[]).find(x=>x.id===holdingId);
  const at = h?.assetType || '';
  const atOpts = [['','Manual price'],['stock','Stock / ETF'],['crypto','Crypto']]
    .map(([v,l])=>`<option value="${v}"${at===v?' selected':''}>${l}</option>`).join('');
  openSheet2('holding',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">${h?'Edit Holding':'Add Holding'}</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Name</label>
        <input id="hold-name" class="form-input" type="text" placeholder="e.g. Vanguard All-World, Bitcoin" value="${escHtml(h?.name||'')}"></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Quantity</label>
          <input id="hold-qty" class="form-input mono" type="text" inputmode="decimal" step="any" placeholder="e.g. 12.5" value="${h?h.qty:''}"></div>
        <div class="form-field"><label class="form-label">Price / unit (${escHtml(acc.currency)})</label>
          <input id="hold-price" class="form-input mono" type="text" inputmode="decimal" step="any" placeholder="0.00" value="${h?(h.price/100).toFixed(2):''}"></div>
      </div>
      <div class="form-field"><label class="form-label">Live price (optional)</label>
        <div class="form-row" style="margin:0">
          <select id="hold-assettype" class="form-input">${atOpts}</select>
          <input id="hold-ticker" class="form-input" type="text" placeholder="Ticker — AAPL, BTC" value="${escHtml(h?.ticker||'')}">
        </div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px;line-height:1.4">Set a type + ticker to pull the live price with “Refresh prices”. Crypto is keyless; stocks need a free Finnhub key.</div>
      </div>
      <div class="form-field"><label class="form-label">Avg buy price / unit (optional — enables gain per holding)</label>
        <input id="hold-avgcost" class="form-input mono" type="text" inputmode="decimal" step="any" placeholder="what you paid on average" value="${h&&h.avgCost!=null?(h.avgCost/100).toFixed(2):''}"></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveHolding('${accId}','${holdingId||''}')">Save Holding</button>
      ${h?`<button class="btn-danger" style="width:100%;margin-top:10px" onclick="deleteHolding('${accId}','${holdingId}')">Delete Holding</button>`:''}
    </div>`);
}
function saveHolding(accId, holdingId) {
  const acc = S.accounts.find(a=>a.id===accId); if (!acc) return;
  const name = document.getElementById('hold-name').value.trim();
  const qty = parseAmount(document.getElementById('hold-qty').value);
  const price = parseAmount(document.getElementById('hold-price').value);
  const avgStr = document.getElementById('hold-avgcost').value;
  const avgCost = avgStr!=='' && !isNaN(parseAmount(avgStr)) ? Math.round(parseAmount(avgStr)*100) : null;
  const assetType = document.getElementById('hold-assettype')?.value || undefined;
  const ticker = (document.getElementById('hold-ticker')?.value || '').trim().toUpperCase() || undefined;
  if (!name) { showToast('Enter a name','error'); return; }
  if (isNaN(qty) || qty<=0 || isNaN(price) || price<0) { showToast('Enter quantity and price','error'); return; }
  acc.holdings = acc.holdings||[];
  const h = acc.holdings.find(x=>x.id===holdingId);
  if (h) Object.assign(h, {name, qty, price:Math.round(price*100), avgCost, assetType, ticker});
  else acc.holdings.push({id:gid(), name, qty, price:Math.round(price*100), avgCost, assetType, ticker});
  syncHoldingsValue(acc);
  saveState(); closeTopSheet2(); openAccDetail(accId); renderCurrentTab();
  showToast(`Holding ${h?'updated':'added'}`,'success');
}
function deleteHolding(accId, holdingId) {
  const acc = S.accounts.find(a=>a.id===accId); if (!acc) return;
  confirmDialog({title:'Delete holding?', message:'The account value will drop by its worth.', confirmLabel:'Delete', danger:true}, ()=>{
    acc.holdings = (acc.holdings||[]).filter(h=>h.id!==holdingId);
    if (acc.holdings.length) syncHoldingsValue(acc);
    saveState(); closeTopSheet2(); openAccDetail(accId); renderCurrentTab();
    showToast('Holding deleted','success');
  });
}
// The holdings equivalent of Update Value: one price field per position, saved together.
function openUpdatePricesSheet(accId) {
  const acc = S.accounts.find(a=>a.id===accId); if (!acc || !(acc.holdings||[]).length) return;
  const rows = acc.holdings.map(h=>`
    <div class="form-field"><label class="form-label">${escHtml(h.name)} — ${h.qty} units (${escHtml(acc.currency)}/unit)</label>
      <input class="form-input mono hold-price-inp" data-hid="${h.id}" type="text" inputmode="decimal" step="any" value="${(h.price/100).toFixed(2)}"></div>`).join('');
  openSheet2('update-prices',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">Update Prices</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">Enter today's price per unit for each holding — the account value updates from these.</div>
      ${rows}
      <button class="btn-primary" onclick="saveUpdatedPrices('${accId}')">Save Prices</button>
    </div>`);
}
function saveUpdatedPrices(accId) {
  const acc = S.accounts.find(a=>a.id===accId); if (!acc) return;
  let bad = false;
  document.querySelectorAll('.hold-price-inp').forEach(inp=>{
    const v = parseAmount(inp.value);
    if (isNaN(v) || v<0) { bad = true; return; }
    const h = acc.holdings.find(x=>x.id===inp.dataset.hid);
    if (h) h.price = Math.round(v*100);
  });
  if (bad) { showToast('Check the prices','error'); return; }
  syncHoldingsValue(acc);
  saveState(); closeTopSheet2(); openAccDetail(accId); renderCurrentTab();
  showToast('Prices updated','success');
}
function openAddAccountSheet(prefill={}) {
  const typeOpts = ACCOUNT_TYPES.map(t=>`<option value="${t.id}"${prefill.type===t.id?' selected':''}>${t.emoji} ${t.name}</option>`).join('');
  const curOpts  = CURRENCIES.map(c=>`<option value="${c.code}"${(prefill.currency||S.settings.defaultCurrency)===c.code?' selected':''}>${c.code} — ${c.name}</option>`).join('');
  // Icon defaults: custom emoji if the account already has one, else its type's emoji.
  const typeEmoji = ACCOUNT_TYPES.find(t=>t.id===(prefill.type||'checking'))?.emoji || '🏦';
  const startEmoji = prefill.emoji || typeEmoji;
  window._newAccColor = prefill.color || ACCOUNT_COLORS[0];
  const emojiGrid = ACCOUNT_EMOJIS.map(e=>`<button type="button" class="cat-emoji-opt${startEmoji===e?' sel':''}" data-emoji="${e}" onclick="pickAccEmoji('${e}')">${e}</button>`).join('');
  const colorDots = ACCOUNT_COLORS.map(col=>`<button type="button" onclick="pickAccColor('${col}')" data-color="${col}" class="acc-color-dot" style="width:30px;height:30px;border-radius:50%;background:${col};border:3px solid ${col===window._newAccColor?'#fff':'transparent'};transition:border-color 150ms;flex-shrink:0"></button>`).join('');
  openSheet('add-acc',`
    <div class="sheet-handle"></div>
    <div class="sheet-title">${prefill.id?'Edit Account':'Add Account'}</div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Account Name</label>
        <input id="acc-name" class="form-input" type="text" placeholder="e.g. Main Checking" value="${escHtml(prefill.name||'')}"></div>
      <div class="form-field"><label class="form-label">Type</label>
        <select id="acc-type" class="form-input" onchange="onAccTypeChange(this.value)">${typeOpts}</select></div>
      <div class="form-field">
        <label class="form-label">Icon</label>
        <div class="cat-emoji-grid">${emojiGrid}</div>
        <input id="acc-emoji" class="form-input" type="text" placeholder="or type any emoji" value="${escHtml(startEmoji)}" style="font-size:20px;text-align:center;height:48px;margin-top:8px" oninput="syncAccEmojiGrid(this.value)">
      </div>
      <div class="form-field"><label class="form-label">Color</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;padding:4px 0">${colorDots}</div></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">${prefill.isVault?'Actual Balance':'Balance'}</label>
          <input id="acc-balance" class="form-input mono" type="text" inputmode="decimal" placeholder="0.00" value="${prefill.balance!=null?(prefill.balance/100).toFixed(2):''}"></div>
        <div class="form-field"><label class="form-label">Currency</label>
          <select id="acc-currency" class="form-input">${curOpts}</select></div>
      </div>
      ${prefill.isVault?`<div style="font-size:12px;color:var(--text-tertiary);margin:-6px 0 12px;line-height:1.4">💡 Set the real current balance from your bank. Future imported deposits/withdrawals adjust it automatically from here.</div>`:''}
      <div class="form-field"><label class="form-label">Institution (optional)</label>
        <input id="acc-institution" class="form-input" type="text" placeholder="e.g. Revolut" value="${escHtml(prefill.institution||'')}"></div>
      <div class="form-field"><label class="form-label">Savings Goal (optional)</label>
        <input id="acc-goal" class="form-input mono" type="text" inputmode="decimal" placeholder="e.g. 5000.00" value="${prefill.goalAmount?(prefill.goalAmount/100).toFixed(2):''}"></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveAccount('${prefill.id||''}')">Save Account</button>
    </div>`);
}
function pickAccEmoji(e) {
  const inp = document.getElementById('acc-emoji');
  if (inp) inp.value = e;
  document.querySelectorAll('#sheet-add-acc .cat-emoji-opt').forEach(b => b.classList.toggle('sel', b.dataset.emoji === e));
}
// Keep the quick-pick grid highlight in sync when the user types their own emoji.
function syncAccEmojiGrid(val) {
  document.querySelectorAll('#sheet-add-acc .cat-emoji-opt').forEach(b => b.classList.toggle('sel', b.dataset.emoji === val.trim()));
}
function pickAccColor(color) {
  window._newAccColor = color;
  document.querySelectorAll('#sheet-add-acc .acc-color-dot').forEach(b => { b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent'; });
}
// When the type changes and the icon is still "following" a type emoji (not customized),
// update it to match the new type. Leave hand-picked custom emojis untouched.
function onAccTypeChange(typeId) {
  const inp = document.getElementById('acc-emoji'); if (!inp) return;
  const typeEmojis = ACCOUNT_TYPES.map(t=>t.emoji);
  if (typeEmojis.includes(inp.value.trim())) {
    const e = ACCOUNT_TYPES.find(t=>t.id===typeId)?.emoji || inp.value;
    inp.value = e; pickAccEmoji(e);
  }
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
  const emoji = (document.getElementById('acc-emoji')?.value || '').trim() || null;
  const color = window._newAccColor || null;
  const goalStr = document.getElementById('acc-goal')?.value;
  const goalAmount = goalStr && parseAmount(goalStr) > 0 ? Math.round(parseAmount(goalStr)*100) : null;
  if (!name) { showToast('Enter account name','error'); return; }
  const balance = isNaN(parseAmount(balStr)) ? 0 : Math.round(parseAmount(balStr)*100);
  const c = defaultConvert(balance, currency);
  const todayStr = new Date().toISOString().slice(0,10);
  if (editId) {
    const idx = S.accounts.findIndex(a=>a.id===editId);
    if (idx>=0) {
      const prev = S.accounts[idx];
      // For auto-managed vaults the typed balance is the REAL current balance: store it as an
      // opening offset (= balance − imported flows) so future imports stay reconciled.
      const openingBalance = prev.isVault ? (balance - vaultNetFlows(prev.vaultName)) : prev.openingBalance;
      const next = {...prev, name, type, balance, currency, institution, emoji, color, convertedBalance:c.ok?c.amount:balance, openingBalance, goalAmount};
      if (type==='investment') {
        if (prev.costBasis == null) { // just became (or was never tracked as) an investment — gain starts now
          next.costBasis = balance;
          next.valueHistory = [{date:todayStr, value:balance}];
        } else if (balance !== prev.balance) { // balance edited by hand = a value correction, not new money
          next.valueHistory = [...(prev.valueHistory||[]), {date:todayStr, value:balance}];
        }
        if ((next.holdings||[]).length) syncHoldingsValue(next); // with holdings, balance is derived — a typed balance can't stick
      }
      S.accounts[idx]=next;
    }
  } else {
    const acc = {id:gid(), name, type, balance, currency, institution, emoji, color, convertedBalance:c.ok?c.amount:balance, goalAmount};
    if (type==='investment') { acc.costBasis = balance; acc.valueHistory = [{date:todayStr, value:balance}]; }
    S.accounts.push(acc);
  }
  saveState(); closeTopSheet(); renderCurrentTab(); // net worth + insights live on other tabs
  showToast(`Account ${editId?'updated':'added'}`,'success');
}
// Inline exchange-rate entry, so accounts in a foreign currency can be counted in Net Worth
// without having to add a transaction first (the only place a rate could be set before).
function openSetRateSheet(fromCur) {
  const dc = S.settings.defaultCurrency;
  const existing = getRate(fromCur, dc);
  openSheet2('set-rate', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Exchange rate</div>
    <div class="sheet-body">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px">Accounts in <strong>${escHtml(fromCur)}</strong> need a rate to be counted in your ${escHtml(dc)} net worth. Enter today's rate — you can update it anytime.</div>
      <div class="form-field"><label class="form-label">Rate</label>
        <div style="display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600">
          <span>1&nbsp;${escHtml(fromCur)}&nbsp;=</span>
          <input id="set-rate-input" class="form-input mono" type="text" inputmode="decimal" placeholder="0.00" value="${existing?escHtml(String(existing)):''}" style="flex:1;font-size:18px">
          <span>${escHtml(dc)}</span>
        </div></div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveManualRate('${jsAttr(fromCur)}')">Save Rate</button>
    </div>`);
  setTimeout(()=>document.getElementById('set-rate-input')?.focus(), 350);
}
function saveManualRate(fromCur) {
  const dc = S.settings.defaultCurrency;
  const v = parseAmount(document.getElementById('set-rate-input')?.value || '');
  if (isNaN(v) || v<=0) { showToast('Enter a valid rate','error'); return; }
  S.exchangeRates[`${fromCur}_${dc}`] = v;
  // Refresh cached converted balances for every account in this currency.
  S.accounts.forEach(a => { if (a.currency===fromCur) { const c=defaultConvert(a.balance,a.currency); a.convertedBalance = c.ok?c.amount:a.balance; } });
  saveState(); closeTopSheet2(); renderCurrentTab();
  showToast(`Rate saved · 1 ${fromCur} = ${v} ${dc}`,'success');
}
function deleteAccount(id) {
  confirmDialog({title:'Delete account?', message:'Its transactions will be kept.', confirmLabel:'Delete', danger:true}, ()=>{
    S.accounts = S.accounts.filter(a=>a.id!==id);
    saveState(); renderCurrentTab(); // net worth + insights live on other tabs
    showToast('Account deleted','success');
  });
}

