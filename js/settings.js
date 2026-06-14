// === SETTINGS ===
function openSettings() {
  const themeLabel = {dark:'Dark',light:'Light',system:'System'}[S.settings.theme]||'Dark';
  const dcInfo = getCurInfo(S.settings.defaultCurrency);
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Settings</div>
    <div class="sheet-body" style="padding:0 0 max(24px,var(--safe-bottom))">
      <div class="settings-grp-title">Preferences</div>
      <div class="settings-row" onclick="openThemePicker()">
        <div class="settings-row-icon" style="background:#1C2128">🎨</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Theme</div><div class="settings-row-val">${themeLabel}</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="openCurrencyPicker('${S.settings.defaultCurrency}',setDefaultCurrency)">
        <div class="settings-row-icon" style="background:#1C2128">💱</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Default Currency</div><div class="settings-row-val">${dcInfo.code} — ${dcInfo.name}</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="toggleFirstDay()">
        <div class="settings-row-icon" style="background:#1C2128">📅</div>
        <div class="settings-row-info"><div class="settings-row-lbl">First Day of Week</div><div class="settings-row-val">${S.settings.firstDayOfWeek==='monday'?'Monday':'Sunday'}</div></div>
        <div class="settings-row-right"><div class="toggle${S.settings.firstDayOfWeek==='monday'?' on':''}"></div></div>
      </div>
      <div class="settings-grp-title">Data</div>
      <div class="settings-row" onclick="openCSVImport()">
        <div class="settings-row-icon" style="background:#1C2128">📥</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Import CSV</div><div class="settings-row-val">Revolut, N26, Wise, Monzo…</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="pickImportJSON()">
        <div class="settings-row-icon" style="background:#1C2128">📤</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Import JSON Backup</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="exportJSON()">
        <div class="settings-row-icon" style="background:#1C2128">💾</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Export JSON</div><div class="settings-row-val">Full backup</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="exportCSV()">
        <div class="settings-row-icon" style="background:#1C2128">📊</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Export CSV</div><div class="settings-row-val">Transactions only</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="loadSampleData()">
        <div class="settings-row-icon" style="background:#1C2128">🎲</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Load Sample Data</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="openCategoriesManager()">
        <div class="settings-row-icon" style="background:#1C2128">🏷️</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Categories</div><div class="settings-row-val">Add, edit, reorder</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="openRecurringManager()">
        <div class="settings-row-icon" style="background:#1C2128">🔄</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Recurring & Subscriptions</div><div class="settings-row-val">Pause or delete scheduled transactions</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-grp-title">Danger Zone</div>
      <div class="settings-row" onclick="clearTransactions()">
        <div class="settings-row-icon" style="background:var(--red-bg)">🧹</div>
        <div class="settings-row-info"><div class="settings-row-lbl" style="color:var(--red)">Delete All Transactions</div><div class="settings-row-val">Keeps accounts, budgets & categories</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
      <div class="settings-row" onclick="clearAllData()">
        <div class="settings-row-icon" style="background:var(--red-bg)">🗑️</div>
        <div class="settings-row-info"><div class="settings-row-lbl" style="color:var(--red)">Clear All Data</div></div>
        <div class="settings-row-right"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>
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
function toggleFirstDay() {
  S.settings.firstDayOfWeek = S.settings.firstDayOfWeek==='monday'?'sunday':'monday';
  saveState(); closeTopSheet(); openSettings();
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
  if (!confirm(`Delete all ${n} transactions? Accounts, budgets and categories are kept. This cannot be undone.`)) return;
  S.transactions = [];
  // Auto-created savings vaults are derived from transactions — drop them so no stale balance lingers.
  S.accounts = S.accounts.filter(a => !a.isVault);
  saveState(); closeAllSheets(); _tabsInit={}; renderCurrentTab();
  showToast(`Deleted ${n} transactions`,'success');
}
function clearAllData() {
  const ans = prompt('Type DELETE to confirm clearing all data:');
  if (ans==='DELETE') {
    localStorage.removeItem(STORAGE_KEY);
    S=defaultState(); applyTheme(); closeAllSheets();
    _tabsInit={}; showOnboarding();
    showToast('All data cleared','success');
  }
}

