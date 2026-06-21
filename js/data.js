// === DATA LAYER ===
function gid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
// Parse a comma-separated tag string into a clean, de-duped array (strips leading '#').
function parseTags(str) {
  return [...new Set((str||'').split(',').map(s => s.trim().replace(/^#+/,'').trim()).filter(Boolean))];
}
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function defaultState() {
  return {
    accounts: [], transactions: [], budgets: [],
    recurringSchedules: [], categories: JSON.parse(JSON.stringify(CATEGORIES)),
    exchangeRates: {}, settings: {defaultCurrency:'EUR',theme:'dark',firstDayOfWeek:'monday'},
    dismissedInsights: [], onboardingComplete: false,
    merchantCategories: {} // learned merchant name -> category id (grows as you categorize)
  };
}
// Remember which category a merchant belongs to, so future entries/imports auto-categorize it.
function learnMerchantCategory(merchant, category) {
  if (!merchant || merchant==='Unknown' || !category || category==='other') return;
  if (!S.merchantCategories) S.merchantCategories = {};
  S.merchantCategories[merchant] = category;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return {...defaultState(), ...p, settings: {...defaultState().settings, ...(p.settings||{})}};
  } catch(e) { return defaultState(); }
}
function saveState() {
  try {
    if (S.settings && !S.settings.createdAt) S.settings.createdAt = Date.now(); // first-use stamp (gates backup nudge)
    const json = JSON.stringify(S);
    if (new Blob([json]).size > 4.2e6) showToast('Storage near limit (4MB)','warning');
    localStorage.setItem(STORAGE_KEY, json);
  } catch(e) { showToast('Failed to save','error'); }
}

// === CURRENCY ENGINE ===
function getCurInfo(code) {
  return CURRENCIES.find(c => c.code === code) || {code, symbol:code, name:code};
}
function formatCurrency(cents, code, compact=false) {
  if (cents == null || isNaN(cents)) return '—';
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style:'currency', currency:code,
      notation: compact && Math.abs(amt) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amt) < 10 ? 2 : 0
    }).format(amt);
  } catch(e) {
    const cur = getCurInfo(code);
    return cur.symbol + Math.abs(amt).toFixed(2);
  }
}
function formatDate(dateStr, opts={month:'short',day:'numeric'}) {
  try { return new Intl.DateTimeFormat(undefined, opts).format(new Date(dateStr+'T12:00:00')); }
  catch(e) { return dateStr; }
}
function getRate(from, to) {
  if (from === to) return 1;
  const k = `${from}_${to}`, rk = `${to}_${from}`;
  if (S.exchangeRates[k]) return S.exchangeRates[k];
  if (S.exchangeRates[rk]) return 1 / S.exchangeRates[rk];
  return null;
}
function convert(cents, from, to) {
  if (from === to) return {amount: cents, rate:1, ok:true};
  const r = getRate(from, to);
  if (!r) return {amount: cents, rate:null, ok:false};
  return {amount: Math.round(cents * r), rate:r, ok:true};
}
function defaultConvert(cents, from) {
  return convert(cents, from, S.settings.defaultCurrency);
}

