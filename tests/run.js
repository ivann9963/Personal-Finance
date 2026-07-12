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

suite('classifySavingsFlow — vault detection', () => {
  check('To Reserves fund → in',   app.classifySavingsFlow('To Reserves fund'),    {vault:'Reserves Fund', flow:'in'});
  check('From Reserves fund → out',app.classifySavingsFlow('From Reserves fund'),  {vault:'Reserves Fund', flow:'out'});
  check('Savings Vault topup → in',app.classifySavingsFlow('Savings Vault topup'), {vault:'Savings Vault', flow:'in'});
  check('From Flexible account',   app.classifySavingsFlow('From Flexible account'),{vault:'Flexible Funds', flow:'out'});
  check('normal merchant → null',  app.classifySavingsFlow('Kaufland'),            null);
  check('peer transfer → null',    app.classifySavingsFlow('Transfer to GEORGI'),  null);
});

suite('interpretCSVRow — savings vaults & round-ups', () => {
  app.setMapping({ date:0, merchant:1, amount:2, currency:3 });
  app.setOverrides({});
  freshState();

  let r = app.interpretCSVRow(['2025-06-25','To Reserves fund','-20.00','EUR'], false);
  check('savings → transfer type', r.type,         'transfer');
  check('savings category',        r.category,     'savings');
  check('vault name',              r.savingsVault, 'Reserves Fund');
  check('flow in',                 r.savingsFlow,  'in');
  check('€20 is not a round-up',   r.isRoundup,    false);

  r = app.interpretCSVRow(['2025-07-29','To Reserves fund','-0.20','EUR'], false);
  check('€0.20 is a round-up',     r.isRoundup,    true);

  r = app.interpretCSVRow(['2025-09-15','From Reserves fund','382.06','EUR'], false);
  check('withdrawal flow out',     r.savingsFlow,  'out');
  check('withdrawal still transfer',r.type,        'transfer');
});

suite('vault balances — flows + opening reconciliation', () => {
  freshState({
    accounts: [{ id:'v1', name:'Reserves Fund', type:'savings', isVault:true, vaultName:'Reserves Fund', currency:'EUR', balance:0, openingBalance:0 }],
    transactions: [
      { savingsVault:'Reserves Fund', savingsFlow:'in',  originalAmount:2000 },
      { savingsVault:'Reserves Fund', savingsFlow:'in',  originalAmount:160  },
      { savingsVault:'Reserves Fund', savingsFlow:'out', originalAmount:1000 },
    ],
  });
  check('net flows = in − out', app.vaultNetFlows('Reserves Fund'), 1160);

  app.recomputeVaultBalances();
  check('balance = opening(0) + flows', app.getState().accounts[0].balance, 1160);

  // reconcile to a real balance of €30 (3000 cents): opening should offset so balance holds and survives more flows
  const acc = app.getState().accounts[0];
  acc.openingBalance = 3000 - app.vaultNetFlows('Reserves Fund'); // = 1840
  app.recomputeVaultBalances();
  check('reconciled to 3000', acc.balance, 3000);

  // a new deposit of 500 keeps reconciliation: 3000 + 500
  app.getState().transactions.push({ savingsVault:'Reserves Fund', savingsFlow:'in', originalAmount:500 });
  app.recomputeVaultBalances();
  check('stays reconciled after new flow', acc.balance, 3500);
});

suite('vault balances — manual transfers survive recompute', () => {
  // A manual account-to-account transfer into a vault must be counted as a flow, so the vault
  // balance is not clobbered when recomputeVaultBalances() runs (e.g. after a later CSV import).
  freshState({
    accounts: [
      { id:'chk', name:'Checking', type:'checking', currency:'EUR', balance:100000 },
      { id:'v1', name:'Reserves Fund', type:'savings', isVault:true, vaultName:'Reserves Fund', currency:'EUR', balance:0, openingBalance:0 },
    ],
    transactions: [
      { id:'t1', type:'transfer', accountId:'chk', toAccountId:'v1', originalAmount:5000, originalCurrency:'EUR' },
    ],
  });
  check('transfer into vault counts as flow', app.vaultNetFlows('Reserves Fund'), 5000);
  app.recomputeVaultBalances();
  check('vault balance survives recompute', app.getState().accounts[1].balance, 5000);

  // A withdrawal back out of the vault nets against it.
  app.getState().transactions.push({ id:'t2', type:'transfer', accountId:'v1', toAccountId:'chk', originalAmount:2000, originalCurrency:'EUR' });
  app.recomputeVaultBalances();
  check('withdrawal nets out', app.getState().accounts[1].balance, 3000);

  // Imported savings flows and manual transfers coexist without double-counting.
  app.getState().transactions.push({ id:'t3', savingsVault:'Reserves Fund', savingsFlow:'in', originalAmount:1000 });
  app.recomputeVaultBalances();
  check('tagged + transfer flows combine', app.getState().accounts[1].balance, 4000);
});

suite('monthlyEquivalent — frequency normalization', () => {
  // The headline subscriptions total must normalize every cadence to a monthly figure.
  check('monthly is unchanged',        app.monthlyEquivalent(1199, 'monthly'), 1199);
  check('yearly /12 (was the bug)',    app.monthlyEquivalent(12000, 'yearly'), 1000);
  check('weekly ~x4.33',               app.monthlyEquivalent(1000, 'weekly'), Math.round(1000*52/12));
  check('biweekly ~x2.17',             app.monthlyEquivalent(1000, 'biweekly'), Math.round(1000*26/12));
  check('daily ~x30.4',                app.monthlyEquivalent(100, 'daily'), Math.round(100*30.4368));
  check('unknown freq → unchanged',    app.monthlyEquivalent(500, 'whatever'), 500);
});

suite('recurringExpenseSchedules — only active expenses', () => {
  freshState({
    recurringSchedules: [
      { id:'a', type:'expense',  active:true,  amount:1000, currency:'EUR', frequency:'monthly', startDate:'2026-01-01' },
      { id:'b', type:'expense',  active:false, amount:1000, currency:'EUR', frequency:'monthly', startDate:'2026-01-01' },
      { id:'c', type:'income',   active:true,  amount:1000, currency:'EUR', frequency:'monthly', startDate:'2026-01-01' },
      { id:'d', type:'transfer', active:true,  amount:1000, currency:'EUR', frequency:'monthly', startDate:'2026-01-01' },
    ],
  });
  const subs = app.recurringExpenseSchedules();
  check('keeps only active expense', subs.length, 1);
  check('correct one kept', subs[0].id, 'a');
});

suite('jsAttr — safe in onclick="fn(\'...\')" against imported data', () => {
  // Reproduce what a browser actually does: HTML-decode the attribute value, THEN run the JS.
  // (&amp; must decode last so it can't double-decode an entity in the data.)
  const htmlDecode = s => s.replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  // Given a value, build the real attribute, decode it, and evaluate the handler capturing its arg.
  const roundtrip = v => {
    const attr = `fn('${app.jsAttr(v)}')`;          // exactly how the app emits it
    const js = htmlDecode(attr);                     // browser decodes the attribute
    let captured, pollutionBefore = global.__pwned;
    // eslint-disable-next-line no-new-func
    new Function('fn', js)(x => { captured = x; });   // browser parses+runs the handler
    return { captured, polluted: global.__pwned !== pollutionBefore };
  };
  const cases = [
    "McDonald's",                       // the common apostrophe that silently broke tap-through
    "x');window.__pwned=1;('",          // code-injection payload
    "Tom & Jerry's",                    // ampersand + apostrophe
    'quote " and \\ backslash',         // double quote + backslash
    "a\nb",                             // newline
    "lä  ' \" \\ < > & ; )",            // kitchen sink
  ];
  cases.forEach(v => {
    const r = roundtrip(v);
    check(`arg preserved: ${JSON.stringify(v).slice(0,24)}`, r.captured, v);
    check(`no code execution: ${JSON.stringify(v).slice(0,24)}`, r.polluted, false);
  });
  check('null/undefined → empty string arg', roundtrip(null).captured, '');
  check('plain gid-style id is unchanged', app.jsAttr('cat_abc123'), 'cat_abc123');
});

suite('JSON backup round-trip — export → restore keeps everything', () => {
  // Build a state exercising every collection, serialize it exactly like exportJSON,
  // then merge it back exactly like importJSON — nothing may be lost or mangled.
  const orig = app.defaultState();
  orig.accounts = [
    {id:'a1', name:'Main', type:'checking', balance:123456, currency:'EUR', convertedBalance:123456, goalAmount:500000},
    {id:'v1', name:'Vault', type:'savings', balance:5000, currency:'EUR', isVault:true, vaultName:'Vault'},
  ];
  orig.transactions = [
    {id:'t1', type:'expense', date:'2026-07-01', merchant:'Lidl', category:'groceries', originalAmount:4599, originalCurrency:'EUR', convertedAmount:4599, accountId:'a1', tags:['weekly','food']},
    {id:'t2', type:'transfer', date:'2026-07-02', merchant:'Transfer', category:'other', originalAmount:10000, originalCurrency:'EUR', convertedAmount:10000, accountId:'a1', toAccountId:'v1'},
  ];
  orig.budgets = [{id:'b1', category:'groceries', amount:30000}];
  orig.recurringSchedules = [{id:'r1', type:'expense', active:true, merchant:'Netflix', amount:1299, currency:'EUR', frequency:'monthly', startDate:'2026-01-05', category:'subscriptions'}];
  orig.categories.push({id:'custom1', name:'Hobbies', emoji:'🎨', color:'#123456'});
  orig.exchangeRates = {USD_EUR: 0.92};
  orig.merchantCategories = {'Lidl':'groceries'};
  orig.settings = {defaultCurrency:'BGN', theme:'light', firstDayOfWeek:'sunday', lastBackupAt: 1750000000000, createdAt: 1749000000000, analyticsSort:{heatmap:'name'}};
  orig.onboardingComplete = true;
  orig.lastImport = {batch:'batch1', count:2, at:1750000000000};

  const restored = app.mergeSavedState(JSON.parse(JSON.stringify(orig)));
  check('accounts preserved',          restored.accounts, orig.accounts);
  check('transactions (incl. tags)',   restored.transactions, orig.transactions);
  check('budgets preserved',           restored.budgets, orig.budgets);
  check('recurring preserved',         restored.recurringSchedules, orig.recurringSchedules);
  check('custom category preserved',   restored.categories.find(c=>c.id==='custom1'), orig.categories.find(c=>c.id==='custom1'));
  check('category count preserved',    restored.categories.length, orig.categories.length);
  check('exchange rates preserved',    restored.exchangeRates, orig.exchangeRates);
  check('learned merchants preserved', restored.merchantCategories, orig.merchantCategories);
  check('settings preserved',          restored.settings, orig.settings);
  check('lastImport preserved',        restored.lastImport, orig.lastImport);
  check('onboardingComplete kept',     restored.onboardingComplete, true);
});

suite('mergeSavedState — old backups gain new defaults', () => {
  // A backup from an older app version lacks fields added since — they must fill in, not be undefined.
  const merged = app.mergeSavedState({ transactions: [{id:'t1'}], settings: {defaultCurrency:'USD'} });
  check('missing collections default', Array.isArray(merged.accounts) && Array.isArray(merged.budgets) && Array.isArray(merged.recurringSchedules), true);
  check('categories default in',       merged.categories.length > 0, true);
  check('kept old defaultCurrency',    merged.settings.defaultCurrency, 'USD');
  check('new settings defaults fill',  merged.settings.theme, 'dark');
  check('data kept',                   merged.transactions, [{id:'t1'}]);
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

suite('projectWealth — compound projection', () => {
  check('0 months → just start',        app.projectWealth(100000, 50000, 5, 0), [100000]);
  check('0% rate = start + n×monthly',  app.projectWealth(100000, 10000, 0, 12)[12], 100000 + 12*10000);
  check('length is months+1',           app.projectWealth(0, 100, 5, 24).length, 25);
  // 12.6825% annual → exactly 1% monthly: 10000×1.01 + 100 each month is hand-checkable
  const r = (Math.pow(1.126825, 1/12) - 1);
  check('monthly rate derivation ~1%',  Math.abs(r - 0.01) < 1e-6, true);
  const p = app.projectWealth(1000000, 0, 12.6825, 2);
  check('compounds monthly (m1)',       p[1], 1010000);
  check('compounds monthly (m2)',       p[2], 1020100);
  const withC = app.projectWealth(1000000, 5000, 12.6825, 1);
  check('contribution added at month end', withC[1], 1015000);
  check('negative rate shrinks',        app.projectWealth(100000, 0, -10, 12)[12] < 100000, true);
});

suite('monthsToReach — milestone ETA', () => {
  check('already there → 0',            app.monthsToReach(50000, 100000, 0, 5), 0);
  check('flat saving: 1000→2000 @100/mo', app.monthsToReach(200000, 100000, 10000, 0), 10);
  check('unreachable → null',           app.monthsToReach(100000000, 0, 0, 0), null);
  const m = app.monthsToReach(200000, 100000, 0, 12.6825); // pure 1%/mo growth: 1.01^m ≥ 2 → m=70
  check('pure growth doubling ~70mo',   m, 70);
});

suite('avgMonthlySavings — net flow per month', () => {
  const now = new Date();
  const mKey = i => new Date(now.getFullYear(), now.getMonth()-i, 15).toISOString().slice(0,10);
  freshState({ transactions: [
    { id:'i1', type:'income',  date:mKey(1), convertedAmount:300000 },
    { id:'e1', type:'expense', date:mKey(1), convertedAmount:100000 },
    { id:'i2', type:'income',  date:mKey(2), convertedAmount:300000 },
    { id:'e2', type:'expense', date:mKey(2), convertedAmount:200000 },
    { id:'t1', type:'transfer',date:mKey(1), convertedAmount:999999 }, // must not count
  ]});
  check('averages only real history months', app.avgMonthlySavings(6), Math.round((200000+100000)/2));
  freshState();
  check('no transactions → 0', app.avgMonthlySavings(), 0);
});

suite('investment tracking — cost basis vs value', () => {
  freshState({ accounts: [
    { id:'inv', name:'ETF', type:'investment', balance:110000, currency:'EUR', costBasis:100000 },
    { id:'chk', name:'Main', type:'checking',  balance:50000,  currency:'EUR' },
  ]});
  check('gain = balance − basis', app.investmentGain(app.getState().accounts[0]), {gain:10000, pct:10});
  check('no basis → null',        app.investmentGain(app.getState().accounts[1]), null);
  const sum = app.investmentSummary();
  check('summary value/basis/gain', {basis:sum.basis, value:sum.value, gain:sum.gain}, {basis:100000, value:110000, gain:10000});
  // A transfer INTO the investment moves basis with balance → gain unchanged
  app.applyTransferBalances({accountId:'chk', toAccountId:'inv', originalAmount:20000, originalCurrency:'EUR'}, false);
  const inv = app.getState().accounts[0];
  check('transfer in: balance +',   inv.balance, 130000);
  check('transfer in: basis +',     inv.costBasis, 120000);
  check('transfer in: gain intact', app.investmentGain(inv).gain, 10000);
  app.applyTransferBalances({accountId:'inv', toAccountId:'chk', originalAmount:5000, originalCurrency:'EUR'}, false);
  check('transfer out: basis −',    app.getState().accounts[0].costBasis, 115000);
  check('transfer out: gain intact',app.investmentGain(app.getState().accounts[0]).gain, 10000);
  // net worth = sum of converted balances
  check('netWorthNow sums accounts', app.netWorthNow(), app.getState().accounts.reduce((s,a)=>s+a.balance,0));
});

suite('holdings — per-position tracking', () => {
  const h1 = { id:'h1', name:'VWCE', qty:12.5, price:11000, avgCost:10000 };
  const h2 = { id:'h2', name:'BTC',  qty:0.05, price:9000000 }; // no avgCost
  check('holdingValue = qty×price (rounded cents)', app.holdingValue(h1), 137500);
  check('fractional qty',                app.holdingValue(h2), 450000);
  check('holdingGain vs avg buy price',  app.holdingGain(h1), {gain:12500, pct:10});
  check('no avgCost → null gain',        app.holdingGain(h2), null);
  check('zero-basis guard',              app.holdingGain({qty:1, price:100, avgCost:0}), {gain:100, pct:0});

  freshState({ accounts: [
    { id:'inv', name:'Broker', type:'investment', balance:1, currency:'EUR', costBasis:500000, holdings:[h1,h2], valueHistory:[{date:'2026-01-01', value:1}] },
  ]});
  const acc = app.getState().accounts[0];
  app.syncHoldingsValue(acc);
  check('sync derives balance from holdings', acc.balance, 587500);
  check('sync appends history',               acc.valueHistory.length, 2);
  check('history point = holdings sum',       acc.valueHistory[1].value, 587500);
  check('costBasis untouched by sync',        acc.costBasis, 500000);
  // same-day second sync overwrites, doesn't append
  acc.holdings[0].price = 12000;
  app.syncHoldingsValue(acc);
  check('same-day sync overwrites',           acc.valueHistory.length, 2);
  check('overwritten value',                  acc.valueHistory[1].value, Math.round(12.5*12000) + 450000);
  // recordValuePoint used directly
  const a2 = { valueHistory: [] };
  app.recordValuePoint(a2, 100); app.recordValuePoint(a2, 200);
  check('recordValuePoint same-day dedupe',   a2.valueHistory.map(p=>p.value), [200]);
  // account with no holdings: sync is a no-op
  const bare = { balance: 777, valueHistory: [] };
  app.syncHoldingsValue(bare);
  check('sync no-op without holdings',        bare.balance, 777);
});

suite('gridToCSVData — Excel grid → CSV pipeline shape', () => {
  // A Revolut-style sheet: leading blank row, Date cells, numeric amounts, a blank row in the middle
  const grid = [
    ['', '', ''],
    ['Type', 'Completed Date', 'Description', 'Amount', 'Currency'],
    ['CARD_PAYMENT', new Date(2026, 5, 14, 19, 25), 'Lidl', -45.99, 'EUR'],
    ['', '', '', '', ''],
    ['TOPUP', new Date(2026, 0, 2), 'Payroll', 3000, 'EUR'],
    [null, undefined, 'trailing junk row with only text', '', ''],
  ];
  const d = app.gridToCSVData(grid);
  check('headers from first non-empty row', d.headers, ['Type','Completed Date','Description','Amount','Currency']);
  check('blank rows dropped', d.rows.length, 3);
  check('Date → local ISO (with time)', d.rows[0][1], '2026-06-14');
  check('Date → local ISO (midnight)',  d.rows[1][1], '2026-01-02');
  check('negative number → string', d.rows[0][3], '-45.99');
  check('positive number → string', d.rows[1][3], '3000');
  check('null/undefined → empty', [d.rows[2][0], d.rows[2][1]], ['','']);
  check('auto-mapping finds the columns', (() => { const m = app.autoMapColumns(d.headers); return {date:m.date, amount:m.amount, merchant:m.merchant, currency:m.currency}; })(), {date:1, amount:3, merchant:2, currency:4});
  check('empty grid is safe', app.gridToCSVData([]), {headers:[], rows:[], delim:','});
});

// ---- async suites (WebCrypto is promise-based), then the summary ----
(async () => {
  suite('cloud backup — encryption round-trip', () => {});
  {
    const secret = 'pass-phrase-1';
    const text = JSON.stringify({transactions:[{merchant:'Lidl', amount:4599}], note:'ünïcödé ✓ 💰'});
    const enc = await app.encryptPayload(text, secret);
    check('payload shape', {v:enc.v, hasSalt:typeof enc.salt==='string', hasIv:typeof enc.iv==='string', hasCt:typeof enc.ct==='string'}, {v:1, hasSalt:true, hasIv:true, hasCt:true});
    check('ciphertext hides plaintext', enc.ct.includes('Lidl') || atob(enc.ct).includes('Lidl'), false);
    check('decrypts back (incl. unicode)', await app.decryptPayload(enc, secret), text);
    let wrongFailed = false;
    try { await app.decryptPayload(enc, 'wrong-pass-99'); } catch(e) { wrongFailed = true; }
    check('wrong passphrase rejected', wrongFailed, true);
    let tamperFailed = false;
    const tampered = {...enc, ct: enc.ct.slice(0,-8) + (enc.ct.slice(-8)==='AAAAAAA=' ? 'BBBBBBB=' : 'AAAAAAA=')};
    try { await app.decryptPayload(tampered, secret); } catch(e) { tamperFailed = true; }
    check('tampered ciphertext rejected', tamperFailed, true);
    const enc2 = await app.encryptPayload(text, secret);
    check('fresh salt/iv each time', enc2.salt !== enc.salt && enc2.iv !== enc.iv, true);
    // Real backups are 100KB+ — the old base64 spread overflowed the call stack on iOS
    const big = JSON.stringify({transactions: Array.from({length: 5000}, (_, i) => ({id:'tx'+i, merchant:'Merchant '+i, note:'x'.repeat(100)}))});
    check('large payload (>500KB) survives', await app.decryptPayload(await app.encryptPayload(big, secret), secret) === big, true);
  }

  suite('cloud backup — gating', () => {
    freshState();
    check('disabled without config', app.cloudEnabled(), false);
    check('inactive without config', app.cloudActive(), false);
    let threw = false;
    try { app.scheduleCloudBackup(); } catch(e) { threw = true; }
    check('schedule is a safe no-op when unconfigured', threw, false);
    freshState({ settings: {...app.defaultState().settings, cloud: {url:'https://x.supabase.co', anonKey:'k'.repeat(40)}} });
    check('enabled with url+key', app.cloudEnabled(), true);
    check('but not active without session+passphrase', app.cloudActive(), false);
  });

  // ---- summary ----
  console.log(`\n${C.bold}──────────────────────────────${C.reset}`);
  console.log(`${C.bold}${passed + failed} tests${C.reset}  ${C.green}${passed} passed${C.reset}  ${failed ? C.red : C.gray}${failed} failed${C.reset}`);
  if (failed) { console.log(`\n${C.red}Failures:${C.reset}`); fails.forEach(f => console.log(`  ${C.red}•${C.reset} ${f}`)); }
  process.exit(failed ? 1 : 0);
})();
