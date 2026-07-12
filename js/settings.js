// === SETTINGS ===
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
// One settings row. `extra` is right-side content (defaults to a chevron); `danger` reddens the label.
function settingsRow(onclick, icon, label, val, {extra=CHEVRON, danger=false, iconBg='#1C2128'}={}) {
  return `<div class="settings-row" onclick="${onclick}">
    <div class="settings-row-icon" style="background:${iconBg}">${icon}</div>
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
        <span style="font-size:18px">${bk.stale?'⚠️':'🛡️'}</span>
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
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Settings</div>
    <div class="sheet-body" style="padding:0 0 max(24px,var(--safe-bottom))">
      <div class="settings-grp-title">Backup &amp; Restore</div>
      ${backupCard}
      ${settingsRow('openCloudBackupSheet()', '☁️', 'Cloud Backup',
        cloudActive() ? `On — last ${relTimeSince(cloudCfg().lastCloudBackupAt)||'never'}` : cloudEnabled() ? 'Set up — finish signing in' : 'Automatic encrypted backup — set up')}

      <div class="settings-grp-title">Preferences</div>
      ${settingsRow('openThemePicker()', '🎨', 'Theme', themeLabel)}
      ${settingsRow(`openCurrencyPicker('${S.settings.defaultCurrency}',setDefaultCurrency)`, '💱', 'Default Currency', `${dcInfo.code} — ${dcInfo.name}`)}
      ${settingsRow('openFirstDayPicker()', '📅', 'Week starts on', S.settings.firstDayOfWeek==='monday'?'Monday':'Sunday')}

      <div class="settings-grp-title">Manage</div>
      ${settingsRow('openCategoriesManager()', '🏷️', 'Categories', 'Add, edit, reorder')}
      ${settingsRow('openRecurringManager()', '🔄', 'Recurring &amp; Subscriptions', 'Manage scheduled payments')}

      <div class="settings-grp-title">Import &amp; Export</div>
      ${settingsRow('exportJSON()', '💾', 'Export backup (JSON)', 'Everything: accounts, transactions, budgets, settings')}
      ${settingsRow('pickImportJSON()', '📂', 'Restore backup (JSON)', 'Load a backup file — puts you right back where you were')}
      ${settingsRow('openCSVImport()', '📥', 'Import from bank (CSV / Excel)', 'Revolut, N26, Wise, Monzo…')}
      ${lastImportCount ? settingsRow('undoLastImport()', '↩️', 'Undo last import', `Remove ${lastImportCount} imported transaction${lastImportCount!==1?'s':''}`) : ''}
      ${settingsRow('exportCSV()', '📊', 'Export transactions (CSV)', 'For spreadsheets — cannot be re-imported with full fidelity')}

      <div class="settings-grp-title">Danger Zone</div>
      ${!hasTx ? settingsRow('loadSampleData()', '🎲', 'Load Sample Data', 'Fills the app with demo data to explore') : ''}
      ${settingsRow('clearTransactions()', '🧹', 'Delete All Transactions', 'Keeps accounts, budgets &amp; categories', {danger:true, iconBg:'var(--red-bg)'})}
      ${settingsRow('clearAllData()', '🗑️', 'Clear All Data', 'Erase everything on this device', {danger:true, iconBg:'var(--red-bg)'})}

      <div style="padding:20px 16px;font-size:12px;color:var(--text-tertiary);text-align:center">Finance v1.0 · All data stored locally on device</div>
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

