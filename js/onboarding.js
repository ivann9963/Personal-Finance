// === ONBOARDING ===
let _obStep=0, _obCurrency='EUR';
function showOnboarding() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
  document.getElementById('main').classList.add('hidden');
  document.getElementById('fab').classList.add('hidden'); // in case onboarding is re-entered after Clear All Data
  _obStep=0; renderObStep();
}
function renderObStep() {
  const el = document.getElementById('onboarding');
  const curOpts = CURRENCIES.map(c=>`<option value="${c.code}"${c.code===_obCurrency?' selected':''}>${c.code} — ${c.name}</option>`).join('');
  const steps = [
    `<div class="ob-wrap">
      <svg class="ob-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
        <rect width="192" height="192" rx="40" fill="var(--accent-bg)"/>
        <polyline points="24,148 64,104 96,116 136,68 168,44" stroke="var(--accent)" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="168" cy="44" r="10" fill="var(--accent)"/>
      </svg>
      <div class="ob-progress">${[0,1,2].map(i=>`<div class="ob-dot${i<=0?' active':''}"></div>`).join('')}</div>
      <div class="ob-title">Welcome to Finance</div>
      <div class="ob-sub">A personal finance tracker that lives on your phone. Private, offline-first, no sign-up required.</div>
      <div class="form-field"><label class="form-label">Default Currency</label>
        <select id="ob-currency" class="form-input" onchange="_obCurrency=this.value">${curOpts}</select></div>
      <div style="display:flex;gap:10px;align-items:flex-start;background:var(--bg-elevated);border-radius:var(--radius);padding:12px 14px;margin-top:4px;text-align:left">
        <span style="font-size:18px;line-height:1.3">🔒</span>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.45">Your data is stored <strong>only on this device</strong> — no account, no cloud, nobody else can see it. Save a backup from Settings now and then so you don't lose it.</div>
      </div>
      <div class="ob-actions"><button class="btn-primary" onclick="obNext()">Get Started</button></div>
    </div>`,
    `<div class="ob-wrap">
      <div style="font-size:56px;margin-bottom:16px">🏦</div>
      <div class="ob-progress">${[0,1,2].map(i=>`<div class="ob-dot${i<=1?' active':''}"></div>`).join('')}</div>
      <div class="ob-title">Add your first account</div>
      <div class="ob-sub">Add a bank account or card to start tracking.</div>
      <div class="form-field"><label class="form-label">Account Name</label>
        <input id="ob-acc-name" class="form-input" type="text" placeholder="e.g. Main Checking"></div>
      <div class="form-field"><label class="form-label">Type</label>
        <select id="ob-acc-type" class="form-input">${ACCOUNT_TYPES.map(t=>`<option value="${t.id}">${t.emoji} ${t.name}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Balance</label>
          <input id="ob-acc-balance" class="form-input mono" type="number" inputmode="decimal" placeholder="0.00"></div>
      </div>
      <div class="ob-actions">
        <button class="btn-primary" onclick="obAddAccount()">Continue</button>
        <button class="btn-secondary" onclick="obNext()">Skip for now</button>
      </div>
    </div>`,
    `<div class="ob-wrap">
      <div style="font-size:56px;margin-bottom:16px">🚀</div>
      <div class="ob-progress">${[0,1,2].map(i=>`<div class="ob-dot active"></div>`).join('')}</div>
      <div class="ob-title">How do you want to start?</div>
      <div class="ob-sub">Import your real transactions from your bank, restore a backup file, explore with sample data, or start with a clean slate.</div>
      <div class="ob-actions">
        <button class="btn-primary" onclick="obImportCSV()">📥 Import from my bank (CSV / Excel)</button>
        <button class="btn-secondary" onclick="pickImportJSON()">📂 Restore from backup (JSON)</button>
        <button class="btn-secondary" onclick="obLoadSample()">🎲 Load sample data</button>
        <button class="btn-secondary" onclick="obFinish()">Start fresh</button>
      </div>
    </div>`
  ];
  el.innerHTML = steps[_obStep]||steps[0];
}
function obNext() { _obStep++; renderObStep(); }
function obAddAccount() {
  const name=(document.getElementById('ob-acc-name')?.value||'').trim();
  const type=document.getElementById('ob-acc-type')?.value||'checking';
  const bal=parseFloat(document.getElementById('ob-acc-balance')?.value||'0')||0;
  if (name) {
    const c=defaultConvert(Math.round(bal*100),_obCurrency);
    S.accounts.push({id:gid(),name,type,balance:Math.round(bal*100),currency:_obCurrency,institution:'',convertedBalance:c.ok?c.amount:Math.round(bal*100)});
    saveState();
  }
  obNext();
}
function obLoadSample() { loadSampleData(); obFinish(); }
function obImportCSV() {
  // CSV import needs an account to import into — create a starter one if the user skipped that step.
  if (!S.accounts.length) {
    const c = defaultConvert(0, _obCurrency);
    S.accounts.push({id:gid(), name:'Main Account', type:'checking', balance:0, currency:_obCurrency, institution:'', convertedBalance:c.ok?c.amount:0});
  }
  obFinish();          // enter the app first…
  openCSVImport();     // …then open the importer on top
}
function obFinish() {
  S.settings.defaultCurrency = _obCurrency;
  S.onboardingComplete = true;
  saveState();
  applyTheme();
  enterApp();
}
// Switch from the onboarding screen to the main app and render the dashboard fresh.
// Also used by importJSON() when a backup is restored from the welcome screen.
function enterApp() {
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('main').classList.remove('hidden');
  document.getElementById('fab').classList.remove('hidden');
  // Hide any tab left visible from before onboarding was (re-)entered via Clear All Data.
  TAB_ORDER.forEach(t => { const el=document.getElementById('tab-'+t); if(el) el.style.display = t==='dashboard'?'':'none'; });
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab==='dashboard'));
  document.getElementById('header-title').textContent = 'Finance';
  _tabsInit = {};
  _currentTab = 'dashboard'; // ensure current tab is set before render
  renderDashboard();
  _tabsInit['dashboard'] = true;
}

