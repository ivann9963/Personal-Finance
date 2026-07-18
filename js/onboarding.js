// === ONBOARDING ===
let _obStep=0, _obCurrency='EUR';
const OB_BACK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
// A little "sparkle" for the clean-slate option.
const OB_FRESH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`;
function showOnboarding() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
  document.getElementById('main').classList.add('hidden');
  document.getElementById('fab').classList.add('hidden'); // in case onboarding is re-entered after Clear All Data
  _obStep=0; renderObStep();
}
// One "how do you want to start" choice card.
function obOption(onclick, icon, title, sub, primary=false) {
  return `<button class="ob-option${primary?' ob-option--primary':''}" onclick="${onclick}">
    <span class="ob-option-icon">${icon}</span>
    <span class="ob-option-text"><span class="ob-option-title">${title}</span><span class="ob-option-sub">${sub}</span></span>
    <span class="ob-option-chev">${CHEVRON}</span>
  </button>`;
}
function renderObStep() {
  const el = document.getElementById('onboarding');
  const curInfo = getCurInfo(_obCurrency);
  const curOpts = CURRENCIES.map(c=>`<option value="${c.code}"${c.code===_obCurrency?' selected':''}>${c.code} — ${c.name}</option>`).join('');
  const dots = active => `<div class="ob-progress">${[0,1,2].map(i=>`<div class="ob-dot${i<=active?' active':''}"></div>`).join('')}</div>`;
  const topbar = `<div class="ob-top">${_obStep>0?`<button class="ob-back" aria-label="Back" onclick="obBack()">${OB_BACK}</button>`:''}</div>`;
  const steps = [
    `<div class="ob-wrap">
      ${topbar}
      <svg class="ob-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
        <rect width="192" height="192" rx="40" fill="var(--accent-bg)"/>
        <polyline points="24,148 64,104 96,116 136,68 168,44" stroke="var(--accent)" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="168" cy="44" r="10" fill="var(--accent)"/>
      </svg>
      ${dots(0)}
      <div class="ob-title">Welcome to Finance</div>
      <div class="ob-sub">A personal finance tracker that lives on your phone — private, offline-first, no sign-up.</div>
      <div class="form-field"><label class="form-label">Your currency</label>
        <select id="ob-currency" class="form-input" onchange="_obCurrency=this.value">${curOpts}</select></div>
      <div class="ob-privacy">
        <span class="ob-privacy-icon">🔒</span>
        <div>Everything stays <strong>on this device</strong> — no account, no cloud, nobody else can see it. You can save a backup file anytime from Settings.</div>
      </div>
      <div class="ob-actions"><button class="btn-primary" onclick="obNext()">Get Started</button></div>
    </div>`,
    `<div class="ob-wrap">
      ${topbar}
      <div class="ob-emoji">🏦</div>
      ${dots(1)}
      <div class="ob-title">Add your first account</div>
      <div class="ob-sub">A bank account, card or cash — so your balances and net worth have somewhere to live. You can add more later.</div>
      <div class="form-field"><label class="form-label">Account name</label>
        <input id="ob-acc-name" class="form-input" type="text" placeholder="e.g. Main Checking"></div>
      <div class="form-field"><label class="form-label">Type</label>
        <select id="ob-acc-type" class="form-input">${ACCOUNT_TYPES.map(t=>`<option value="${t.id}">${t.emoji} ${t.name}</option>`).join('')}</select></div>
      <div class="form-field"><label class="form-label">Current balance (${curInfo.symbol})</label>
        <input id="ob-acc-balance" class="form-input mono" type="text" inputmode="decimal" placeholder="0.00"></div>
      <div class="ob-actions">
        <button class="btn-primary" onclick="obAddAccount()">Continue</button>
        <button class="btn-secondary" onclick="obNext()">Skip for now</button>
      </div>
    </div>`,
    `<div class="ob-wrap">
      ${topbar}
      ${dots(2)}
      <div class="ob-title">How do you want to start?</div>
      <div class="ob-sub">Pick one — you can change everything later.</div>
      <div class="ob-option-list">
        ${obOption('obImportCSV()', ICONS.download, 'Import from my bank', 'CSV or Excel — Revolut, N26, Wise, Monzo…', true)}
        ${obOption('pickImportJSON()', ICONS.restore, 'Restore a backup', 'From a JSON file you saved before')}
        ${obOption('obLoadSample()', ICONS.grid, 'Explore with sample data', 'See how it all works with demo data')}
        ${obOption('obFinish()', OB_FRESH, 'Start fresh', 'A clean slate — add things as you go')}
      </div>
    </div>`
  ];
  el.innerHTML = steps[_obStep]||steps[0];
}
function obBack() { if (_obStep>0) { _obStep--; renderObStep(); } }
function obNext() { _obStep++; renderObStep(); }
function obAddAccount() {
  const name=(document.getElementById('ob-acc-name')?.value||'').trim();
  const type=document.getElementById('ob-acc-type')?.value||'checking';
  const bal=parseAmount(document.getElementById('ob-acc-balance')?.value||'0')||0;
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

