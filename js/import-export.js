// === IMPORT / EXPORT ===
function exportJSON() {
  const blob = new Blob([JSON.stringify(S,null,2)], {type:'application/json'});
  dlBlob(blob, `finance-backup-${today()}.json`);
  showToast('Backup exported','success');
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
    merchant:['description','payee','merchant','name','reference','narrative','empfaenger','verwendungszweck'],
    category:['category','type','transaction type'],
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
  const preview = _csvData.rows.slice(0,3).map(row=>
    `<tr>${row.map(c=>`<td>${escHtml(c.slice(0,20))}</td>`).join('')}</tr>`
  ).join('');
  body.innerHTML = `
    <div class="form-field"><label class="form-label">Column Mapping</label>
    <div class="csv-table-wrap"><table class="csv-table">
      <thead><tr><th>Header</th><th>Map to</th></tr></thead>
      <tbody>${selects}</tbody>
    </table></div></div>
    <div class="form-field"><label class="form-label">Target Account</label>
      <select id="csv-account" class="form-input">${accOpts}</select></div>
    <div class="form-field"><label class="form-label">Preview (first 3 rows)</label>
    <div class="csv-table-wrap"><table class="csv-table">
      <thead><tr>${_csvData.headers.map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${preview}</tbody>
    </table></div></div>
    <button class="btn-primary" onclick="runCSVImport()">Import ${_csvData.rows.length} rows</button>
    <div style="height:8px"></div>`;
}
function updateCSVMap(colIdx, field) {
  Object.keys(_csvMapping).forEach(k => { if (_csvMapping[k]===colIdx) delete _csvMapping[k]; });
  if (field !== 'skip') _csvMapping[field] = colIdx;
}
function parseDateStr(s) {
  s=s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(s)) {
    const [a,b,y]=s.split(/[\/\-\.]/);
    return parseInt(a)>12 ? `${y}-${b}-${a}` : `${y}-${a}-${b}`;
  }
  return null;
}
function runCSVImport() {
  const accId = document.getElementById('csv-account')?.value;
  if (!accId) { showToast('Select an account','error'); return; }
  let imported=0, skipped=0;
  _csvData.rows.forEach(row => {
    const get = field => _csvMapping[field] != null ? (row[_csvMapping[field]]||'').trim() : '';
    const dateStr = parseDateStr(get('date'));
    const rawAmt  = parseFloat(get('amount').replace(/[^0-9.\-]/g,''));
    if (!dateStr || isNaN(rawAmt)) { skipped++; return; }
    const cents = Math.round(Math.abs(rawAmt)*100);
    const cur   = get('currency') || S.settings.defaultCurrency;
    const merchant = get('merchant') || 'Unknown';
    const type  = rawAmt < 0 ? 'expense' : 'income';
    // Duplicate check
    const dup = S.transactions.some(t => t.date===dateStr && t.originalAmount===cents && t.merchant===merchant);
    if (dup) { skipped++; return; }
    // Auto-category from past transactions
    const pastCat = S.transactions.find(t=>t.merchant===merchant)?.category || 'other';
    const dc = defaultConvert(cents, cur);
    S.transactions.push({id:gid(), type, originalAmount:cents, originalCurrency:cur,
      convertedAmount: dc.ok?dc.amount:cents, exchangeRate:dc.rate||1,
      category: get('category')||pastCat, merchant, accountId:accId,
      date:dateStr, note:get('notes')||''});
    imported++;
  });
  S.transactions.sort((a,b)=>b.date.localeCompare(a.date));
  saveState(); closeTopSheet(); renderCurrentTab();
  showToast(`Imported ${imported}, skipped ${skipped} duplicates`,'success');
}

