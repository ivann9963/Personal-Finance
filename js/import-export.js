// === IMPORT / EXPORT ===
function exportJSON() {
  S.settings.lastBackupAt = Date.now(); // remember when the user last backed up
  const blob = new Blob([JSON.stringify(S,null,2)], {type:'application/json'});
  dlBlob(blob, `finance-backup-${today()}.json`);
  saveState();
  if (typeof refreshSettingsIfOpen === 'function') refreshSettingsIfOpen();
  showToast('Backup saved','success');
}
function exportCSV() {
  const hdr = 'Date,Type,Merchant,Category,Amount,Currency,ConvertedAmount,DefaultCurrency,Account,Note\n';
  const rows = S.transactions.map(t => {
    const acc = S.accounts.find(a=>a.id===t.accountId);
    return [t.date, t.type, csvCell(t.merchant), t.category,
      (t.originalAmount/100).toFixed(2), t.originalCurrency,
      (t.convertedAmount/100).toFixed(2), S.settings.defaultCurrency,
      csvCell(acc?acc.name:''), csvCell(t.note||'')].join(',');
  });
  dlBlob(new Blob([hdr+rows.join('\n')],{type:'text/csv'}), `finance-transactions-${today()}.csv`);
  showToast('CSV exported','success');
}
function csvCell(s) { return '"'+String(s).replace(/"/g,'""')+'"'; }
function dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function today() { return new Date().toISOString().slice(0,10); }
function importJSON(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const txCount = parsed.transactions?.length ?? 0;
      const accCount = parsed.accounts?.length ?? 0;
      if (!confirm(`Import backup?\n${accCount} accounts, ${txCount} transactions.\nThis will overwrite current data.`)) return;
      S = {...defaultState(), ...parsed, settings:{...defaultState().settings,...(parsed.settings||{})}};
      saveState(); applyTheme(); generateRecurring(); renderCurrentTab();
      if (typeof refreshSettingsIfOpen === 'function') refreshSettingsIfOpen();
      showToast(`Imported ${txCount} transactions`,'success');
    } catch(e) { showToast('Invalid JSON file','error'); }
  };
  r.readAsText(file);
}

// CSV import — multi-step
let _csvData = null;
let _csvMapping = {};
function openCSVImport() {
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Import CSV</div>
    <div class="sheet-body" id="csv-body">
      <div style="margin-bottom:16px;color:var(--text-secondary);font-size:14px;line-height:1.5">
        Import transactions from Revolut, N26, Wise, Monzo or any bank CSV.
      </div>
      <label class="btn-secondary" style="display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Choose CSV File
        <input type="file" accept=".csv" style="display:none" onchange="handleCSVFile(this)">
      </label>
    </div>`;
  openSheet('csv', html);
}
function handleCSVFile(inp) {
  const file = inp.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    _csvData = parseCSV(e.target.result);
    _csvMapping = autoMapColumns(_csvData.headers);
    _csvMerchantOverrides = {};
    renderCSVMapping();
  };
  r.readAsText(file);
}
function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const delim = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const headers = parseCSVLine(lines[0], delim);
  const rows = lines.slice(1).filter(l=>l.trim()).map(l=>parseCSVLine(l,delim));
  return {headers, rows, delim};
}
function parseCSVLine(line, d) {
  const out=[]; let cur='', inQ=false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if (c==='"') { inQ=!inQ; }
    else if (c===d && !inQ) { out.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  out.push(cur.trim()); return out;
}
function autoMapColumns(headers) {
  const MAP = {
    date:['date','transaction date','value date','booking date','completed date','buchungstag'],
    amount:['amount','amount (eur)','local amount','debit','credit','value','betrag'],
    merchant:['description','payee','merchant','name','narrative','counterparty','beneficiary','recipient','details','empfaenger','verwendungszweck'],
    category:['category','spending category'],
    currency:['currency','local currency','waehrung'],
    notes:['notes','note','memo','payment reference','notes and #tags']
  };
  const m={};
  headers.forEach((h,i) => {
    const hl = h.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(MAP)) {
      if (aliases.some(a=>hl.includes(a)) && !m[field]) { m[field]=i; break; }
    }
  });
  return m;
}
function renderCSVMapping() {
  const body = document.getElementById('csv-body'); if (!body) return;
  const opts = ['skip','date','amount','merchant','category','currency','notes'];
  const selects = _csvData.headers.map((h,i) => {
    const cur = Object.entries(_csvMapping).find(([,v])=>v===i)?.[0] || 'skip';
    return `<tr><td style="font-weight:600">${escHtml(h)}</td><td>
      <select class="form-input" style="font-size:13px;padding:4px 8px" onchange="updateCSVMap(${i},this.value)">
        ${opts.map(o=>`<option value="${o}"${o===cur?' selected':''}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`).join('')}
      </select></td></tr>`;
  }).join('');
  const accOpts = S.accounts.map(a=>`<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
  body.innerHTML = `
    <div class="form-field"><label class="form-label">Column Mapping</label>
    <div class="csv-table-wrap"><table class="csv-table">
      <thead><tr><th>Header</th><th>Map to</th></tr></thead>
      <tbody>${selects}</tbody>
    </table></div></div>
    <div class="form-field"><label class="form-label">Target Account</label>
      <select id="csv-account" class="form-input">${accOpts}</select></div>
    <div class="form-field"><label class="form-label">Amount Sign</label>
      <select id="csv-sign" class="form-input" onchange="renderCSVPreview()">
        <option value="neg-expense">Negative amounts are expenses (most banks)</option>
        <option value="pos-expense">Positive amounts are expenses</option>
      </select></div>
    <div class="form-field"><label class="form-label">Preview — how it will be saved</label>
      <div id="csv-preview"></div></div>
    <button class="btn-primary" onclick="runCSVImport()">Import ${_csvData.rows.length} rows</button>
    <div style="height:8px"></div>`;
  renderCSVPreview();
}
// Merchant/description → category, by keyword. First match wins; whole-word match for
// short alphanumeric keys, substring for multi-word/symbol keys (e.g. "h&m").
const MERCHANT_RULES = [
  ['groceries', ['kaufland','lidl','billa','fantastico','conad','carrefour','albert heijn','spar','masoutis','cba','kome','mesar','jumbo','krasi','supermarket','market','eco market','galaxias','penny','rewe','aldi','food outlet','burlex','t market','metro','grocery']],
  ['food', ['restaurant','trattoria','osteria','pizzeria','pizza','gelateria','gelaterie','taverna','mehana','kebab','gyros','paesano','starita','sushi','coffee','cafe','caffe','bakery','pasticceria','forneria','amorino','wolt','glovo','bistro','grill','cocktail','syndicate','sofra','kreta','dave']],
  ['transport', ['omv','lukoil','shell','petrol','eko','bgtoll','bg toll','sofia transit','public transport','transit','ovpay','atac','egnatia','diodia','parking','bolt','uber','taxi','speedy','econt','obilet','ryanair','aelia','toll','bus']],
  ['fitness', ['multisport','orbita fitness','senshi','playtomic','padel','tennis','tenis','gym','fitness']],
  ['health', ['sofarmasi','sopharmacy','drogerie','lilly','hospis','neoclinic','serdikamed','bodimed','ramus','biomet','thorax','clinic','pharmacy','dkc','mdl','medical','apteka']],
  ['subscriptions', ['anthropic','openai','youtube','apple','itunes','spotify','netflix','google','microsoft','adobe','posteo','premium plan']],
  ['savings', ['kraken','freedom 24','freedom24','binance','coinbase']],
  ['shopping', ['amazon','ebag','ozone','h&m','uniqlo','intersport','sport vision','asics','borosport','body shop','technopolis','decathlon','mall','zara','ticketstation','eventim','eventease','sport','store']],
  ['utilities', ['a1','vivacom','yettel','telenor','easypay','national revenue']],
];
function inferCategoryFromMerchant(m) {
  const s = (m||'').toLowerCase();
  if (!s || s==='unknown') return null;
  for (const [catId, kws] of MERCHANT_RULES) {
    for (const kw of kws) {
      if (/[^a-z0-9]/.test(kw)) { if (s.includes(kw)) return catId; }
      else if (new RegExp('\\b'+kw+'\\b').test(s)) return catId;
    }
  }
  return null;
}
// Detect money moving to/from a savings vault or fund. Returns {vault, flow:'in'|'out'} or null.
const SAVINGS_VAULTS = [
  [/reserves? fund/, 'Reserves Fund'],
  [/savings? vault/, 'Savings Vault'],
  [/flexible (account|cash|funds?)/, 'Flexible Funds'],
  [/\bvault\b/, 'Savings Vault'],
];
function classifySavingsFlow(d) {
  d = (d||'').toLowerCase();
  if (!d) return null;
  const hit = SAVINGS_VAULTS.find(([re]) => re.test(d));
  if (!hit) return null;
  const flow = d.startsWith('from ') ? 'out' : 'in'; // "To X"/"X topup" = deposit; "From X" = withdrawal
  return { vault: hit[1], flow };
}
// Classify by description for non-purchase rows (peer transfers, currency exchanges, top-ups)
function classifyByDescription(d) {
  d = (d||'').toLowerCase();
  if (!d) return null;
  if (d.includes('exchanged to')) return {type:'transfer', category:'other'};
  if (d.startsWith('transfer to') || d.startsWith('transfer from') || d.startsWith('to ') || d.startsWith('from ')
    || d.includes('revolut ltd') || d.includes('revolut bank') || d.includes('revolut france') || d.includes('revolut,')
    || d.includes('p2p') || d.includes('personal payments')) return {type:'transfer', category:'other'};
  if (d.includes('top-up') || d.includes('topup') || d.startsWith('payment from')) return {type:'income', category:'income'};
  return null;
}
let _csvMerchantOverrides = {}; // merchant -> {category?, type?} set manually in the review step
function interpretCSVRow(row, posIsExpense) {
  const get = field => _csvMapping[field] != null ? (row[_csvMapping[field]]||'').trim() : '';
  const dateStr = parseDateStr(get('date'));
  const rawAmt  = parseAmountStr(get('amount'));
  const valid = !!dateStr && !isNaN(rawAmt) && rawAmt !== 0;
  const cents = isNaN(rawAmt) ? null : Math.round(Math.abs(rawAmt)*100);
  const cur = get('currency') || S.settings.defaultCurrency;
  const mappedCat = mapCategoryValue(get('category'));
  // Merchant: explicit column → note → mapped category name → 'Unknown'
  const merchant = get('merchant') || get('notes') || (mappedCat ? getCatInfo(mappedCat).name : '') || 'Unknown';
  // Base type from amount sign
  let type = (posIsExpense ? rawAmt > 0 : rawAmt < 0) ? 'expense' : 'income';
  let category, autoMatched = true;
  // Savings vaults / funds (Reserves Fund, Savings Vault, …) are money moved between accounts.
  const savings = classifySavingsFlow(merchant);
  if (savings) {
    type = 'transfer'; category = 'savings';
  } else {
    const special = classifyByDescription(merchant);
    if (special) {
      type = special.type; category = special.category;
    } else {
      category = mappedCat
        || (S.merchantCategories && S.merchantCategories[merchant])   // learned from your history
        || inferCategoryFromMerchant(merchant)                        // seeded keyword rules
        || (merchant !== 'Unknown' ? S.transactions.find(t=>t.merchant===merchant)?.category : null);
      if (!category) { category = 'other'; autoMatched = false; }
    }
  }
  // Manual overrides from the review step take precedence
  const ov = _csvMerchantOverrides[merchant];
  if (ov) { if (ov.category) { category = ov.category; autoMatched = true; } if (ov.type) type = ov.type; }
  // Round-ups: small automatic deposits into a vault (spare-change fills to the nearest unit)
  const isRoundup = !!(savings && savings.flow === 'in' && cents != null && cents < 100);
  return {valid, dateStr, cents, cur, merchant, type, category, rawAmt, autoMatched,
          savingsVault: savings ? savings.vault : null, savingsFlow: savings ? savings.flow : null, isRoundup};
}
function renderCSVPreview() {
  const el = document.getElementById('csv-preview'); if (!el) return;
  const posIsExpense = document.getElementById('csv-sign')?.value === 'pos-expense';
  const typeBadge = t => t==='expense'?'<span class="text-red">Expense</span>':t==='income'?'<span class="text-green">Income</span>':'<span style="color:var(--blue)">Transfer</span>';
  const rows = _csvData.rows.slice(0,6).map(row => {
    const r = interpretCSVRow(row, posIsExpense);
    if (!r.valid) return `<tr><td colspan="4" style="color:var(--text-tertiary)">— skipped (zero/!date)</td></tr>`;
    const ci = getCatInfo(r.category);
    const sign = r.type==='income'?'+':r.type==='expense'?'-':'';
    return `<tr>
      <td style="${r.merchant==='Unknown'?'color:var(--amber)':''}">${escHtml(r.merchant.slice(0,22))}</td>
      <td style="white-space:nowrap;font-family:'JetBrains Mono',monospace">${sign}${formatCurrency(r.cents,r.cur)}</td>
      <td style="white-space:nowrap;font-size:11px">${typeBadge(r.type)}</td>
      <td style="white-space:nowrap;${r.autoMatched?'':'color:var(--amber)'}">${ci.emoji} ${escHtml(ci.name)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="csv-table-wrap"><table class="csv-table">
    <thead><tr><th>Merchant</th><th>Amount</th><th>Type</th><th>Category</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Preview of first 6 rows. Transfers & currency exchanges are auto-detected and excluded from spending.</div>
    ${renderCSVReviewSection(posIsExpense)}`;
}
// Distinct merchants whose category could not be auto-detected (landed in "Other") — let the user fix them in bulk.
function renderCSVReviewSection(posIsExpense) {
  const groups = {};
  _csvData.rows.forEach(row => {
    const r = interpretCSVRow(row, posIsExpense);
    if (!r.valid || r.type==='transfer' || r.autoMatched) return;
    groups[r.merchant] = groups[r.merchant] || {count:0,total:0,cur:r.cur,type:r.type};
    groups[r.merchant].count++; groups[r.merchant].total += r.cents;
  });
  const entries = Object.entries(groups).sort((a,b)=>b[1].total-a[1].total).slice(0,40);
  if (!entries.length) return `<div style="font-size:13px;color:var(--green);margin-top:14px;font-weight:600">✓ All rows auto-categorized</div>`;
  const catOpts = c => S.categories.map(x=>`<option value="${x.id}"${x.id===c?' selected':''}>${x.emoji} ${escHtml(x.name)}</option>`).join('');
  const rows = entries.map(([m,g])=>{
    const cur = _csvMerchantOverrides[m]?.category || 'other';
    return `<div class="csv-review-row">
      <div class="csv-review-info"><div class="truncate" style="font-weight:600;font-size:13px">${escHtml(m)}</div><div style="font-size:11px;color:var(--text-tertiary)">${g.count}× · ${formatCurrency(g.total,g.cur,true)}</div></div>
      <select class="form-input" style="font-size:12px;padding:6px 8px;max-width:150px" onchange="setCSVMerchantCat('${escHtml(m).replace(/'/g,"\\'")}',this.value)">${catOpts(cur)}</select>
    </div>`;
  }).join('');
  return `<div style="margin-top:16px">
    <div class="form-label" style="color:var(--amber)">⚠️ ${entries.length} merchant${entries.length===1?'':'s'} need a category</div>
    <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">These couldn't be matched automatically. Set a category (applied to all of that merchant's rows), or leave as Other.</div>
    ${rows}
  </div>`;
}
function setCSVMerchantCat(merchant, catId) {
  _csvMerchantOverrides[merchant] = {..._csvMerchantOverrides[merchant], category: catId==='other'?undefined:catId};
  // Re-render only the preview table header rows (cheap) — full re-render keeps selects in sync
  renderCSVPreview();
}
function updateCSVMap(colIdx, field) {
  // A field maps to exactly one column: clear any other column currently holding this field
  if (field !== 'skip') Object.keys(_csvMapping).forEach(k => { if (k===field) delete _csvMapping[k]; });
  Object.keys(_csvMapping).forEach(k => { if (_csvMapping[k]===colIdx) delete _csvMapping[k]; });
  if (field !== 'skip') _csvMapping[field] = colIdx;
  renderCSVPreview();
}
const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function pad2(n) { return String(n).padStart(2,'0'); }
function parseDateStr(s) {
  s = (s||'').trim();
  if (!s) return null;
  // Strip a time component, e.g. "2024-01-15 10:30:00" or "2024-01-15T10:30:00Z"
  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?$/, '');
  // ISO: yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd
  let m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  // Numeric d/m/y or m/d/y
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length===2) y = (+y<70?'20':'19')+y;
    a=+a; b=+b;
    if (a>12) return `${y}-${pad2(b)}-${pad2(a)}`; // a must be day -> b is month
    if (b>12) return `${y}-${pad2(a)}-${pad2(b)}`; // b must be day -> a is month
    return `${y}-${pad2(b)}-${pad2(a)}`; // ambiguous -> assume day/month (European default)
  }
  // "14 Jun 2026" / "14-Jun-2026"
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})\.?[\s\-,]+(\d{4})$/);
  if (m) { const mo=MONTH_NAMES.indexOf(m[2].slice(0,3).toLowerCase())+1; if(mo) return `${m[3]}-${pad2(mo)}-${pad2(m[1])}`; }
  // "Jun 14, 2026" / "Jun 14 2026"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) { const mo=MONTH_NAMES.indexOf(m[1].slice(0,3).toLowerCase())+1; if(mo) return `${m[3]}-${pad2(mo)}-${pad2(m[2])}`; }
  // Fallback to native parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return null;
}
function parseAmountStr(raw) {
  let s = (raw||'').trim().replace(/[^0-9.,\-]/g,'');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g,'').replace(',','.'); // comma = decimal separator
  else s = s.replace(/,/g,''); // comma = thousands separator
  return parseFloat(s);
}
// Map common bank/export category labels to our internal category ids
const CATEGORY_ALIASES = {
  groceries: ['groceries','grocery','supermarket','supermarkets','market','convenience store','food shop'],
  food: ['food','restaurant','restaurants','dining','takeaway','takeout','fast food','coffee','cafe','bakery','food & drink','food and drink','eating out'],
  transport: ['transport','transportation','transit','fuel','gas','petrol','parking','taxi','uber','public transport','car','rideshare'],
  housing: ['housing','rent','mortgage','home','household'],
  health: ['health','healthcare','pharmacy','wellness'],
  entertainment: ['entertainment','leisure','movies','cinema','games','gaming','recreation','hobbies'],
  shopping: ['shopping','retail','clothes','clothing','general','electronics'],
  income: ['income','salary','wages','paycheck','payroll','deposit','earnings'],
  savings: ['savings','investment','investments'],
  travel: ['travel','vacation','holiday','hotel','flights','airbnb'],
  subscriptions: ['subscription','subscriptions','streaming','software','services'],
  education: ['education','tuition','books','courses','school'],
  pets: ['pets','pet'],
  fitness: ['fitness','gym','sports'],
  gifts: ['gifts','gift','donation','donations','charity'],
  medical: ['medical'],
  bars: ['bars','nightlife','bar','pub','alcohol'],
  utilities: ['utilities','electricity','water','internet','phone','mobile','telecom']
};
function mapCategoryValue(raw) {
  const v = (raw||'').trim().toLowerCase();
  if (!v) return null;
  // Direct match against our category ids/names
  const direct = S.categories.find(c => c.id.toLowerCase()===v || c.name.toLowerCase()===v);
  if (direct) return direct.id;
  // Token-based alias match (avoids "CARD_PAYMENT" matching "car" → transport)
  const norm = w => w.replace(/s$/,'');                              // light singularization
  const tokens = v.split(/[^a-z]+/).filter(Boolean);
  for (const [catId, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const a of aliases) {
      if (a.includes(' ')) { if (v.includes(a)) return catId; }      // multi-word: substring
      else if (tokens.some(t => t===a || norm(t)===norm(a))) return catId; // single word: whole token (plural-tolerant)
    }
  }
  return null;
}
// Find (or create) the auto-managed account that backs a Revolut-style savings vault/fund.
function getOrCreateVaultAccount(vaultName, currency) {
  let acc = S.accounts.find(a => a.isVault && a.vaultName === vaultName);
  if (!acc) {
    acc = {id:gid(), name:vaultName, type:'savings', balance:0, currency:currency||S.settings.defaultCurrency,
           institution:'Revolut', convertedBalance:0, isVault:true, vaultName, openingBalance:0};
    S.accounts.push(acc);
  }
  return acc;
}
// Net of deposits (in) − withdrawals (out) for a vault. Two sources feed a vault:
//   1. Imported / round-up flows tagged with `savingsVault` + `savingsFlow`.
//   2. Manual account-to-account transfers whose source/destination IS this vault's account.
// Both are summed here so the vault balance has a single source of truth (opening + flows)
// and never gets clobbered when balances are recomputed after an import.
function vaultNetFlows(vaultName) {
  const acc = S.accounts.find(a => a.isVault && a.vaultName === vaultName);
  const toVaultCur = (cents, cur) =>
    acc && cur && cur !== acc.currency ? Math.round(cents * (getRate(cur, acc.currency) || 1)) : cents;
  return S.transactions.reduce((s, t) => {
    if (t.savingsVault === vaultName) {
      return s + (t.savingsFlow === 'out' ? -t.originalAmount : t.originalAmount);
    }
    if (acc && t.type === 'transfer' && t.toAccountId) { // a manual transfer (has an explicit destination)
      if (t.toAccountId === acc.id) return s + toVaultCur(t.originalAmount, t.originalCurrency); // money in
      if (t.accountId   === acc.id) return s - toVaultCur(t.originalAmount, t.originalCurrency); // money out
    }
    return s;
  }, 0);
}
// Vault balance = opening balance (manual reconciliation point) + net of its tagged flows.
function recomputeVaultBalances() {
  S.accounts.filter(a => a.isVault).forEach(acc => {
    const bal = (acc.openingBalance || 0) + vaultNetFlows(acc.vaultName);
    acc.balance = bal;
    const c = defaultConvert(bal, acc.currency);
    acc.convertedBalance = c.ok ? c.amount : bal;
  });
}
function runCSVImport() {
  const accId = document.getElementById('csv-account')?.value;
  if (!accId) { showToast('Select an account','error'); return; }
  const posIsExpense = document.getElementById('csv-sign')?.value === 'pos-expense';
  const get = (row, field) => _csvMapping[field] != null ? (row[_csvMapping[field]]||'').trim() : '';
  const batchId = gid();
  let imported=0, invalid=0, duplicates=0, savedToVaults=0;
  _csvData.rows.forEach(row => {
    const r = interpretCSVRow(row, posIsExpense);
    if (!r.valid) { invalid++; return; }
    // Duplicate check
    const dup = S.transactions.some(t => t.date===r.dateStr && t.originalAmount===r.cents && t.merchant===r.merchant);
    if (dup) { duplicates++; return; }
    // Savings-vault flows live in their own auto-created account; everything else in the target.
    const targetId = r.savingsVault ? getOrCreateVaultAccount(r.savingsVault, r.cur).id : accId;
    const dc = defaultConvert(r.cents, r.cur);
    S.transactions.push({id:gid(), type:r.type, originalAmount:r.cents, originalCurrency:r.cur,
      convertedAmount: dc.ok?dc.amount:r.cents, exchangeRate:dc.rate||1,
      category: r.category, merchant:r.merchant, accountId:targetId,
      date:r.dateStr, note:get(row,'notes')||'', importBatch:batchId,
      savingsVault:r.savingsVault||undefined, savingsFlow:r.savingsFlow||undefined, isRoundup:r.isRoundup||undefined});
    if (r.savingsVault) savedToVaults++;
    if (r.type !== 'transfer') learnMerchantCategory(r.merchant, r.category); // remember for next time
    imported++;
  });
  recomputeVaultBalances();
  S.transactions.sort((a,b)=>b.date.localeCompare(a.date));
  saveState(); closeTopSheet(); renderCurrentTab();
  const parts = [`Imported ${imported}`];
  if (savedToVaults) parts.push(`${savedToVaults} to savings`);
  if (duplicates) parts.push(`${duplicates} duplicates skipped`);
  if (invalid) parts.push(`${invalid} skipped`);
  showToast(parts.join(', '), imported>0?'success':'error');
}

