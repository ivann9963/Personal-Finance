// === DATA LAYER ===
function gid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
// Parse a comma-separated tag string into a clean, de-duped array (strips leading '#').
function parseTags(str) {
  return [...new Set((str||'').split(',').map(s => s.trim().replace(/^#+/,'').trim()).filter(Boolean))];
}
// Parse a user- or bank-typed amount into a Number, tolerant of both decimal conventions.
// The LAST-occurring separator is treated as the decimal point, the other as thousands:
//   "13,90" → 13.9 · "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "€13.90" → 13.9
// This is why typing "13,90" must NOT be a blanket comma-strip (that gave 1390).
function parseAmount(raw) {
  let s = String(raw==null?'':raw).trim().replace(/[^0-9.,\-]/g,'');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g,'').replace(/,/g,'.'); // comma = decimal separator
  else s = s.replace(/,/g,''); // comma = thousands separator
  return parseFloat(s);
}
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Safe interpolation of a value into a SINGLE-quoted JS string that itself lives inside a
// DOUBLE-quoted HTML on* attribute, e.g. onclick="fn('${jsAttr(x)}')". escHtml alone is NOT
// enough here: the browser HTML-decodes the attribute before the JS parser runs, so an escaped
// quote (&#39;) turns back into ' and closes the string — letting imported data (merchant names,
// tags) break the handler or execute code. We first backslash-escape for the JS string context,
// then escHtml for the attribute context; the two survive together (\&#39; decodes to \').
function jsAttr(s) {
  return escHtml(String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
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
// Merge a parsed state object (localStorage or a backup file) over defaults, so fields
// added to the app after the data was saved get sensible values instead of undefined.
function mergeSavedState(p) {
  return {...defaultState(), ...p, settings: {...defaultState().settings, ...(p.settings||{})}};
}
let _loadError = null; // set when saved data couldn't be parsed, so the UI can offer recovery
// One-time refresh of existing installs to the curated default categories: upsert every default
// (refreshing name/emoji/colour/order) while KEEPING any custom categories the user added. Runs
// once, gated by settings.categoriesV2, so later user edits are never clobbered again. Transaction
// category ids are preserved (defaults keep their ids), so nothing gets orphaned.
function migrateCategories(state) {
  if (!state.settings || state.settings.categoriesV2) return state;
  const byId = new Map((state.categories||[]).map(c => [c.id, c]));
  const merged = CATEGORIES.map(def => ({ ...(byId.get(def.id) || {}), ...def }));
  const defaultIds = new Set(CATEGORIES.map(c => c.id));
  (state.categories||[]).forEach(c => { if (!defaultIds.has(c.id)) merged.push(c); }); // keep customs
  state.categories = merged;
  state.settings.categoriesV2 = true;
  return state;
}
function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) { /* storage blocked */ }
  if (raw == null || raw === '') return defaultState();
  try {
    return migrateCategories(mergeSavedState(JSON.parse(raw)));
  } catch(e) {
    // NEVER silently wipe a finance app's whole history on a parse error. Preserve the unreadable
    // data under a separate key (so the next saveState can't clobber it) and flag it so the app can
    // warn the user and offer to restore from a backup instead of pretending they're a new user.
    _loadError = { at: Date.now(), bytes: raw.length };
    try { localStorage.setItem(STORAGE_KEY + '__corrupt_' + Date.now(), raw); } catch(_){}
    return defaultState();
  }
}
function saveState() {
  try {
    if (S.settings && !S.settings.createdAt) S.settings.createdAt = Date.now(); // first-use stamp (gates backup nudge)
    const json = JSON.stringify(S);
    if (new Blob([json]).size > 4.2e6) showToast('Storage near limit (4MB)','warning');
    localStorage.setItem(STORAGE_KEY, json);
    if (typeof scheduleCloudBackup === 'function') scheduleCloudBackup(); // debounced, no-op unless enabled
  } catch(e) { showToast('Failed to save','error'); }
}

// === CURRENCY ENGINE ===
function getCurInfo(code) {
  return CURRENCIES.find(c => c.code === code) || {code, symbol:code, name:code};
}
// Default: full-precision money (always 2 decimals) so the amount you typed and the amount you
// see never diverge. compact=true → abbreviated for headline tiles (summary, calendar, insights):
// big values use "€12K" notation, everything else drops cents, matching the app's dashboard look.
function formatCurrency(cents, code, compact=false) {
  if (cents == null || isNaN(cents)) return '—';
  const amt = cents / 100;
  try {
    if (compact) {
      const big = Math.abs(amt) >= 10000;
      return new Intl.NumberFormat(undefined, {
        style:'currency', currency:code,
        notation: big ? 'compact' : 'standard',
        maximumFractionDigits: big ? 0 : (Math.abs(amt) < 10 ? 2 : 0)
      }).format(amt);
    }
    return new Intl.NumberFormat(undefined, {
      style:'currency', currency:code,
      minimumFractionDigits: 2, maximumFractionDigits: 2
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
// True when an account is in a non-default currency with no exchange rate available to convert it.
// Such accounts silently drop out of Net Worth (contribute 0), so the UI uses this to warn the
// user and prompt for a rate instead of quietly under-reporting their wealth.
function accountNeedsRate(a) {
  return a && a.currency !== S.settings.defaultCurrency && getRate(a.currency, S.settings.defaultCurrency) == null;
}

