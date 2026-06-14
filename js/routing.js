// === ROUTING ===
const TAB_ORDER = ['dashboard','transactions','plan','analytics','accounts'];
function switchTab(tab) {
  if (tab === _currentTab) return;
  const from = _currentTab;
  const fromEl = document.getElementById('tab-'+from);
  const toEl   = document.getElementById('tab-'+tab);
  if (!toEl) return;
  const dir = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(from) ? 1 : -1;
  // Show target, set initial position
  toEl.style.display = '';
  toEl.classList.remove('slide-left','slide-right');
  toEl.classList.add(dir > 0 ? 'slide-right' : 'slide-left');
  // Force reflow
  toEl.offsetHeight;
  // Animate in
  toEl.classList.remove('slide-left','slide-right');
  fromEl.classList.add(dir > 0 ? 'slide-left' : 'slide-right');
  setTimeout(()=>{ fromEl.style.display='none'; fromEl.classList.remove('slide-left','slide-right'); }, 300);
  // Update nav
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  // Update header
  const titles = {dashboard:'Finance',transactions:'Transactions',plan:'Plan',analytics:'Analytics',accounts:'Accounts'};
  document.getElementById('header-title').textContent = titles[tab] || tab;
  // Show/hide FAB
  document.getElementById('fab').classList.toggle('hidden', tab === 'analytics');
  _currentTab = tab;
  // Render if first visit
  if (!_tabsInit[tab]) { _tabsInit[tab]=true; renderTab(tab); }
}
function renderTab(tab) {
  switch(tab) {
    case 'dashboard':    renderDashboard(); break;
    case 'transactions': renderTransactions(); break;
    case 'plan':         renderPlan(); break;
    case 'analytics':    renderAnalytics(); break;
    case 'accounts':     renderAccounts(); break;
  }
}
function renderCurrentTab() {
  renderTab(_currentTab);
  Object.keys(_tabsInit).forEach(t => { if(t!==_currentTab) delete _tabsInit[t]; });
}

