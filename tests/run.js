// Unit tests for the finance app's parsing & CSV-import logic.
// Run with:  node tests/run.js
const { loadApp } = require('./harness');
const app = loadApp();

// ---- tiny test framework with colored output ----
const C = { gray:'\x1b[90m', red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m', bold:'\x1b[1m', reset:'\x1b[0m' };
let passed = 0, failed = 0, suiteName = '';
const fails = [];
function suite(name, fn) { suiteName = name; console.log(`\n${C.bold}${C.cyan}▸ ${name}${C.reset}`); fn(); }
function show(v) { return typeof v === 'object' ? JSON.stringify(v) : String(v); }
function check(label, actual, expected) {
  const ok = show(actual) === show(expected);
  if (ok) { passed++; console.log(`  ${C.green}✓${C.reset} ${label}`); }
  else {
    failed++; fails.push(`${suiteName} › ${label}`);
    console.log(`  ${C.red}✗ ${label}${C.reset}`);
    console.log(`      ${C.gray}expected:${C.reset} ${C.green}${show(expected)}${C.reset}`);
    console.log(`      ${C.gray}actual:  ${C.reset} ${C.red}${show(actual)}${C.reset}`);
  }
}

// Fresh state with the app's default categories for each integration test.
function freshState(extra = {}) {
  const s = app.defaultState();
  app.setState(Object.assign(s, extra));
  return s;
}

// =====================================================================
suite('parseDateStr — many formats', () => {
  check('ISO yyyy-mm-dd',            app.parseDateStr('2026-06-14'),            '2026-06-14');
  check('slashes yyyy/mm/dd',        app.parseDateStr('2026/06/14'),            '2026-06-14');
  check('dots yyyy.mm.dd',           app.parseDateStr('2026.06.14'),            '2026-06-14');
  check('European dd/mm/yyyy',       app.parseDateStr('14/06/2026'),            '2026-06-14');
  check('US mm/dd/yyyy (day>12)',    app.parseDateStr('06/14/2026'),            '2026-06-14');
  check('ambiguous 5/3 → d/m',       app.parseDateStr('5/3/2026'),              '2026-03-05');
  check('2-digit year',              app.parseDateStr('14/06/26'),              '2026-06-14');
  check('ISO with time (space)',     app.parseDateStr('2024-01-15 10:30:00'),   '2024-01-15');
  check('ISO with T/Z',              app.parseDateStr('2024-01-15T10:30:00Z'),  '2024-01-15');
  check('Revolut timestamp',         app.parseDateStr('2023-06-22 19:25:02'),   '2023-06-22');
  check('"14 Jun 2026"',             app.parseDateStr('14 Jun 2026'),           '2026-06-14');
  check('"14-Jun-2026"',             app.parseDateStr('14-Jun-2026'),           '2026-06-14');
  check('"Jun 14, 2026"',            app.parseDateStr('Jun 14, 2026'),          '2026-06-14');
  check('empty → null',              app.parseDateStr(''),                      null);
  check('garbage → null',            app.parseDateStr('not a date'),            null);
});

suite('parseAmountStr — US & European', () => {
  check('plain negative',            app.parseAmountStr('-45.99'),   -45.99);
  check('EU comma decimal',          app.parseAmountStr('45,99'),     45.99);
  check('EU with symbol',            app.parseAmountStr('-€45,99'),  -45.99);
  check('EU thousands+decimal',      app.parseAmountStr('1.234,56'),  1234.56);
  check('US thousands+decimal',      app.parseAmountStr('1,234.56'),  1234.56);
  check('integer',                   app.parseAmountStr('1234'),      1234);
  check('symbol before sign',        app.parseAmountStr('€-45,99'),  -45.99);
  check('empty → NaN',               app.parseAmountStr(''),          NaN);
});

suite('mapCategoryValue — explicit category column', () => {
  freshState();
  check('Groceries → groceries',     app.mapCategoryValue('Groceries'),    'groceries');
  check('Restaurants (plural)→food', app.mapCategoryValue('Restaurants'),  'food');
  check('Supermarket → groceries',   app.mapCategoryValue('Supermarket'),  'groceries');
  check('exact id "food"',           app.mapCategoryValue('food'),         'food');
  check('exact name "Food & Dining"',app.mapCategoryValue('Food & Dining'),'food');
  check('CARD_PAYMENT → null',       app.mapCategoryValue('CARD_PAYMENT'), null);
  check('TRANSFER → null',           app.mapCategoryValue('TRANSFER'),     null);
  check('empty → null',              app.mapCategoryValue(''),             null);
});

suite('inferCategoryFromMerchant — seeded keyword rules', () => {
  freshState();
  check('Kaufland → groceries',      app.inferCategoryFromMerchant('Kaufland'),      'groceries');
  check('CBA → groceries',           app.inferCategoryFromMerchant('Kome CBA'),      'groceries');
  check('Anthropic → subscriptions', app.inferCategoryFromMerchant('Anthropic'),     'subscriptions');
  check('Sofia Transit → transport', app.inferCategoryFromMerchant('Sofia Transit'), 'transport');
  check('LUKOIL → transport',        app.inferCategoryFromMerchant('LUKOIL'),        'transport');
  check('A1 → utilities',            app.inferCategoryFromMerchant('A1'),            'utilities');
  check('Kraken → savings',          app.inferCategoryFromMerchant('Kraken'),        'savings');
  check('word-boundary: "scar"≠car', app.inferCategoryFromMerchant('scar studio'),   null);
  check('unknown local store → null',app.inferCategoryFromMerchant('Aygold Eood'),    null);
});

suite('classifyByDescription — transfers / exchanges / income', () => {
  check('Exchanged to USD',     app.classifyByDescription('Exchanged to USD'),                {type:'transfer', category:'other'});
  check('Transfer to person',   app.classifyByDescription('Transfer to GEORGI KOVACHEV'),     {type:'transfer', category:'other'});
  check('Savings Vault topup',  app.classifyByDescription('Savings Vault topup'),             {type:'transfer', category:'savings'});
  check('To Reserves fund',     app.classifyByDescription('To Reserves fund'),                {type:'transfer', category:'savings'});
  check('Top-up by card',       app.classifyByDescription('Top-up by *8405'),                 {type:'income', category:'income'});
  check('normal merchant→null', app.classifyByDescription('Kaufland'),                        null);
});

suite('interpretCSVRow — integration', () => {
  // CSV columns: [date, merchant, amount, currency]
  app.setMapping({ date:0, merchant:1, amount:2, currency:3 });
  app.setOverrides({});
  freshState();

  let r = app.interpretCSVRow(['2026-06-13','Kaufland','-31.71','EUR'], false);
  check('expense type',        r.type,        'expense');
  check('keyword → groceries', r.category,    'groceries');
  check('auto-matched',        r.autoMatched, true);
  check('cents abs',           r.cents,       3171);

  r = app.interpretCSVRow(['2026-06-13','Exchanged to USD','-1.92','EUR'], false);
  check('exchange → transfer', r.type,        'transfer');

  r = app.interpretCSVRow(['2025-12-18','Top-up by *8405','350.00','EUR'], false);
  check('topup → income',      r.type,        'income');

  r = app.interpretCSVRow(['2026-06-13','Aygold Eood','-307.00','EUR'], false);
  check('unknown → other',     r.category,    'other');
  check('unknown not matched', r.autoMatched, false);

  r = app.interpretCSVRow(['2025-12-26','Premium plan fee','0.00','EUR'], false);
  check('zero amount invalid', r.valid,       false);

  // positive=expense convention
  r = app.interpretCSVRow(['2026-06-13','Some Shop','45.00','EUR'], true);
  check('pos-expense flips sign', r.type,     'expense');
});

suite('interpretCSVRow — learned history beats keyword guess', () => {
  app.setMapping({ date:0, merchant:1, amount:2, currency:3 });
  app.setOverrides({});
  freshState({ merchantCategories: { 'Aygold Eood': 'shopping', 'Kaufland': 'health' } });

  let r = app.interpretCSVRow(['2026-06-13','Aygold Eood','-307.00','EUR'], false);
  check('learned unknown store',  r.category,    'shopping');
  check('learned → auto-matched', r.autoMatched, true);

  r = app.interpretCSVRow(['2026-06-13','Kaufland','-31.71','EUR'], false);
  check('learned overrides keyword', r.category, 'health');
});

suite('interpretCSVRow — manual override wins over everything', () => {
  app.setMapping({ date:0, merchant:1, amount:2, currency:3 });
  freshState({ merchantCategories: { 'Aygold Eood': 'shopping' } });
  app.setOverrides({ 'Aygold Eood': { category: 'food' } });

  const r = app.interpretCSVRow(['2026-06-13','Aygold Eood','-307.00','EUR'], false);
  check('override beats learned', r.category, 'food');
});

suite('learnMerchantCategory — guards', () => {
  freshState();
  app.learnMerchantCategory('Local Bakery', 'food');
  check('stores real merchant', app.getState().merchantCategories['Local Bakery'], 'food');
  app.learnMerchantCategory('Unknown', 'food');
  check('ignores "Unknown"', app.getState().merchantCategories['Unknown'], undefined);
  app.learnMerchantCategory('Mystery', 'other');
  check('ignores "other"', app.getState().merchantCategories['Mystery'], undefined);
});

// ---- summary ----
console.log(`\n${C.bold}──────────────────────────────${C.reset}`);
console.log(`${C.bold}${passed + failed} tests${C.reset}  ${C.green}${passed} passed${C.reset}  ${failed ? C.red : C.gray}${failed} failed${C.reset}`);
if (failed) { console.log(`\n${C.red}Failures:${C.reset}`); fails.forEach(f => console.log(`  ${C.red}•${C.reset} ${f}`)); }
process.exit(failed ? 1 : 0);
