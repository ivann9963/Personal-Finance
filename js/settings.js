// === SETTINGS ===
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
// Consistent stroke-based (Feather-style) icons for settings rows. A single line-icon set reads far
// more premium than a column of mismatched emojis. Monochrome — colour comes from .settings-row-icon.
const _svg = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
  theme:    _svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
  currency: _svg('<line x1="12" y1="1.5" x2="12" y2="22.5"/><path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  calendar: _svg('<rect x="3" y="4.5" width="18" height="17" rx="2"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  type:     _svg('<polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" fill="currentColor" stroke="none"/>'),
  account:  _svg('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>'),
  tag:      _svg('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none"/>'),
  recurring:_svg('<polyline points="17 1.5 21 5.5 17 9.5"/><path d="M3 11.5v-2a4 4 0 0 1 4-4h14"/><polyline points="7 22.5 3 18.5 7 14.5"/><path d="M21 12.5v2a4 4 0 0 1-4 4H3"/>'),
  shield:   _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  alert:    _svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  save:     _svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'),
  restore:  _svg('<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>'),
  download: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  file:     _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
  undo:     _svg('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  cloud:    _svg('<path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'),
  grid:     _svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  trash2:   _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
  trash:    _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
};
// One settings row. `extra` is right-side content (defaults to a chevron); `danger` reddens it.
function settingsRow(onclick, icon, label, val, {extra=CHEVRON, danger=false, iconBg=''}={}) {
  return `<div class="settings-row" onclick="${onclick}">
    <div class="settings-row-icon${danger?' danger':''}"${iconBg?` style="background:${iconBg}"`:''}>${icon}</div>
    <div class="settings-row-info"><div class="settings-row-lbl"${danger?' style="color:var(--red)"':''}>${label}</div>${val?`<div class="settings-row-val">${val}</div>`:''}</div>
    <div class="settings-row-right">${extra}</div>
  </div>`;
}
// Human-readable "time since" for the last-backup line.
function relTimeSince(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now()-ts)/864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days/30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
// Backup health. Stale when there's real data to lose AND it's been a while since the last
// backup (>14 days), or — if never backed up — since first use (>3 days). The first-use grace
// avoids nagging brand-new users (and people just exploring sample data) the moment they start.
function backupStatus() {
  const hasData = S.transactions.length > 0 || S.accounts.length > 0;
  const last = S.settings.lastBackupAt;
  const created = S.settings.createdAt || Date.now();
  const rel = relTimeSince(last);
  const daysSince = last ? (Date.now()-last)/864e5 : (Date.now()-created)/864e5;
  const stale = hasData && (last ? daysSince > 14 : daysSince > 3);
  return {hasData, rel, stale};
}
function refreshSettingsIfOpen() {
  if (document.getElementById('sheet-settings')) openSettings();
}
function openSettings() {
  const themeLabel = {dark:'Dark',light:'Light',system:'System'}[S.settings.theme]||'Dark';
  const dcInfo = getCurInfo(S.settings.defaultCurrency);
  const hasTx = S.transactions.length > 0;
  // Live count for "Undo last import" (some of the batch may since have been edited/deleted).
  const lastImportCount = S.lastImport?.batch ? S.transactions.filter(t=>t.importBatch===S.lastImport.batch).length : 0;
  const bk = backupStatus();
  // Prominent backup card — the thing that protects the user's whole financial history.
  const backupCard = `
    <div style="margin:8px 16px 4px;padding:16px;border-radius:var(--radius);background:${bk.stale?'var(--red-bg)':'var(--bg-elevated)'};border:1px solid ${bk.stale?'var(--red)':'transparent'}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span class="backup-card-icon${bk.stale?' stale':''}">${bk.stale?ICONS.alert:ICONS.shield}</span>
        <span style="font-weight:700;font-size:15px">Backup</span>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.45;margin-bottom:12px">
        ${bk.rel
          ? `Last backup <strong style="color:${bk.stale?'var(--red)':'var(--text-primary)'}">${bk.rel}</strong>. Your data lives only on this device${bk.stale?' — back it up so a lost phone or cleared browser can\'t erase it.':'.'}`
          : `Your data lives <strong>only on this device</strong>. If you clear your browser or lose your phone, it\'s gone. Save a backup file you can restore from.`}
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" style="flex:1;padding:11px" onclick="exportJSON()">Back Up Now</button>
        <button class="btn-secondary" style="flex:1;padding:11px" onclick="pickImportJSON()">Restore</button>
      </div>
    </div>`;
  // New-transaction defaults (fall back to sensible values when unset).
  const defTypeLabel = {expense:'Expense',income:'Income',transfer:'Transfer'}[S.settings.defaultTxType||'expense'];
  const defAcc = S.accounts.find(a=>a.id===S.settings.defaultAccountId);
  const defAccLabel = defAcc ? defAcc.name : (S.accounts.length ? 'First account' : 'No accounts yet');
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Settings</div>
    <div class="sheet-body" style="padding:0 0 max(24px,var(--safe-bottom))">
      <div class="settings-grp-title">Backup &amp; Restore</div>
      ${backupCard}
      ${settingsRow('openCloudBackupSheet()', ICONS.cloud, 'Cloud Backup',
        cloudActive() ? `On — last ${relTimeSince(cloudCfg().lastCloudBackupAt)||'never'}` : cloudEnabled() ? 'Set up — finish signing in' : 'Automatic encrypted backup — set up')}

      <div class="settings-grp-title">General</div>
      ${settingsRow('openThemePicker()', ICONS.theme, 'Theme', themeLabel)}
      ${settingsRow(`openCurrencyPicker('${S.settings.defaultCurrency}',setDefaultCurrency)`, ICONS.currency, 'Default Currency', `${dcInfo.code} — ${dcInfo.name}`)}
      ${settingsRow('openFirstDayPicker()', ICONS.calendar, 'Week starts on', S.settings.firstDayOfWeek==='monday'?'Monday':'Sunday')}

      <div class="settings-grp-title">New Transaction Defaults</div>
      ${settingsRow('openDefaultTypePicker()', ICONS.type, 'Default type', defTypeLabel)}
      ${S.accounts.length ? settingsRow('openDefaultAccountPicker()', ICONS.account, 'Default account', defAccLabel) : ''}

      <div class="settings-grp-title">Manage</div>
      ${settingsRow('openCategoriesManager()', ICONS.tag, 'Categories', 'Add, edit, reorder')}
      ${settingsRow('openRecurringManager()', ICONS.recurring, 'Recurring &amp; Subscriptions', 'Manage scheduled payments')}

      <div class="settings-grp-title">Import &amp; Export</div>
      ${settingsRow('exportJSON()', ICONS.save, 'Export backup (JSON)', 'Everything: accounts, transactions, budgets, settings')}
      ${settingsRow('pickImportJSON()', ICONS.restore, 'Restore backup (JSON)', 'Load a backup file — puts you right back where you were')}
      ${settingsRow('openCSVImport()', ICONS.download, 'Import from bank (CSV / Excel)', 'Revolut, N26, Wise, Monzo…')}
      ${lastImportCount ? settingsRow('undoLastImport()', ICONS.undo, 'Undo last import', `Remove ${lastImportCount} imported transaction${lastImportCount!==1?'s':''}`) : ''}
      ${settingsRow('exportCSV()', ICONS.file, 'Export transactions (CSV)', 'For spreadsheets — cannot be re-imported with full fidelity')}

      ${!hasTx ? `<div class="settings-grp-title">Explore</div>
      ${settingsRow('loadSampleData()', ICONS.grid, 'Load Sample Data', 'Fills the app with demo data to explore')}` : ''}

      <div class="settings-grp-title">Danger Zone</div>
      ${settingsRow('clearTransactions()', ICONS.trash2, 'Delete All Transactions', 'Keeps accounts, budgets &amp; categories', {danger:true, iconBg:'var(--red-bg)'})}
      ${settingsRow('clearAllData()', ICONS.trash, 'Clear All Data', 'Erase everything on this device', {danger:true, iconBg:'var(--red-bg)'})}

      <div style="padding:20px 16px;font-size:12px;color:var(--text-tertiary);text-align:center;line-height:1.6">
        Finance v1.0 · All data stored locally on device<br>
        ${storageSummary()}
      </div>
    </div>`;
  openSheet('settings', html);
}
function openThemePicker() {
  const themes = [{id:'dark',label:'Dark',emoji:'🌙'},{id:'light',label:'Light',emoji:'☀️'},{id:'system',label:'System',emoji:'⚙️'}];
  const rows = themes.map(t=>`<div class="quick-item" onclick="setTheme('${t.id}');closeTopSheet2()">${t.emoji} ${t.label}${S.settings.theme===t.id?' ✓':''}</div>`).join('');
  openSheet2('theme-picker',`<div class="sheet-handle"></div><div class="sheet-title">Theme</div><div class="sheet-body" style="padding:0">${rows}</div>`);
}
function setTheme(theme) {
  S.settings.theme=theme; saveState(); applyTheme();
  document.querySelector('#sheet-settings .settings-row-val') && openSettings();
}
function applyTheme() {
  const t = S.settings.theme;
  const resolved = t==='system' ? (window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark') : t;
  document.documentElement.dataset.theme = resolved;
  document.getElementById('theme-meta').content = resolved==='light'?'#FAFAF7':'#0D1117';
}
function setDefaultCurrency(code) {
  S.settings.defaultCurrency=code; saveState();
  showToast(`Default currency: ${code}`,'success');
  renderCurrentTab();
}
function openFirstDayPicker() {
  const days = [{id:'monday',label:'Monday'},{id:'sunday',label:'Sunday'}];
  const rows = days.map(d=>`<div class="quick-item" onclick="setFirstDay('${d.id}');closeTopSheet2()">${d.label}${S.settings.firstDayOfWeek===d.id?' ✓':''}</div>`).join('');
  openSheet2('firstday-picker',`<div class="sheet-handle"></div><div class="sheet-title">Week starts on</div><div class="sheet-body" style="padding:0">${rows}</div>`);
}
function setFirstDay(day) {
  S.settings.firstDayOfWeek = day; saveState();
  refreshSettingsIfOpen();
  invalidateOtherTabs(); // the Plan calendar grid depends on this
}
// Which type the Add-Transaction sheet opens on by default.
function openDefaultTypePicker() {
  const types = [{id:'expense',label:'Expense',emoji:'💸'},{id:'income',label:'Income',emoji:'💰'},{id:'transfer',label:'Transfer',emoji:'🔁'}];
  const cur = S.settings.defaultTxType || 'expense';
  const rows = types.map(t=>`<div class="quick-item" onclick="setDefaultTxType('${t.id}');closeTopSheet2()">${t.emoji} ${t.label}${cur===t.id?' ✓':''}</div>`).join('');
  openSheet2('deftype-picker',`<div class="sheet-handle"></div><div class="sheet-title">Default type</div><div class="sheet-body" style="padding:0">${rows}</div>`);
}
function setDefaultTxType(type) { S.settings.defaultTxType = type; saveState(); refreshSettingsIfOpen(); }
// Which account new transactions are pre-filled with. "First account" = clear the preference.
function openDefaultAccountPicker() {
  const cur = S.settings.defaultAccountId || '';
  const rows = [`<div class="quick-item" onclick="setDefaultAccount('');closeTopSheet2()">🏦 First account (default)${!cur?' ✓':''}</div>`]
    .concat(S.accounts.map(a=>`<div class="quick-item" onclick="setDefaultAccount('${jsAttr(a.id)}');closeTopSheet2()">${accountEmoji(a)} ${escHtml(a.name)}${cur===a.id?' ✓':''}</div>`)).join('');
  openSheet2('defacc-picker',`<div class="sheet-handle"></div><div class="sheet-title">Default account</div><div class="sheet-body" style="padding:0">${rows}</div>`);
}
function setDefaultAccount(id) { S.settings.defaultAccountId = id || null; saveState(); refreshSettingsIfOpen(); }
// Footer line: how much local storage the app is using + record counts.
function storageSummary() {
  let bytes = 0;
  try { bytes = new Blob([localStorage.getItem(STORAGE_KEY)||'']).size; } catch(e) {}
  const kb = bytes/1024;
  const size = kb < 1024 ? `${kb.toFixed(kb<10?1:0)} KB` : `${(kb/1024).toFixed(1)} MB`;
  return `${size} used · ${S.transactions.length} transaction${S.transactions.length!==1?'s':''} · ${S.accounts.length} account${S.accounts.length!==1?'s':''}`;
}
function pickImportJSON() {
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='.json';
  inp.onchange=()=>importJSON(inp.files[0]);
  inp.click();
}
function clearTransactions() {
  const n = S.transactions.length;
  if (!n) { showToast('No transactions to delete','info'); return; }
  confirmDialog({title:`Delete all ${n} transactions?`, message:'Accounts, budgets and categories are kept. This cannot be undone.', confirmLabel:'Delete all', danger:true}, ()=>{
    S.transactions = [];
    // Auto-created savings vaults are derived from transactions — drop them so no stale balance lingers.
    S.accounts = S.accounts.filter(a => !a.isVault);
    saveState(); closeAllSheets(); _tabsInit={}; renderCurrentTab();
    showToast(`Deleted ${n} transactions`,'success');
  });
}
function clearAllData() {
  confirmDialog({title:'Clear all data?', message:'This permanently erases every account, transaction, budget and setting on this device. This cannot be undone.', confirmLabel:'Delete everything', danger:true}, ()=>{
    localStorage.removeItem(STORAGE_KEY);
    S=defaultState(); applyTheme(); closeAllSheets();
    _tabsInit={}; showOnboarding();
    showToast('All data cleared','success');
  });
}

