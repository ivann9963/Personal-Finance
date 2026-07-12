// Automated UI smoke — the regression net that unit tests (node tests/run.js) can't provide.
// It drives the REAL app in a headless browser: renders every tab/sheet and asserts no throw,
// then exercises the specific interactions that broke in the past (things that stayed green in
// unit tests while the app was broken at runtime):
//   • CSV import's file button still opens (a haptic overlay once hijacked it)
//   • buttons fire their action exactly once (the overlay once ate the click)
//   • merchant tap-through survives apostrophes / injection payloads (the onclick escaping bug)
//   • add-transaction through the real form persists
//   • cloud backup sheet renders in its unconfigured state
//
// Run:  npm run test:ui           (needs: npm i  &&  npx playwright install chromium)
// Zero-dependency logic tests remain:  node tests/run.js
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };

// --- tiny static server (no deps) ---
function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// --- tiny assert framework ---
const C = { red:'\x1b[31m', green:'\x1b[32m', gray:'\x1b[90m', bold:'\x1b[1m', cyan:'\x1b[36m', reset:'\x1b[0m' };
let passed = 0, failed = 0; const fails = [];
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ${C.green}✓${C.reset} ${label}`); }
  else { failed++; fails.push(label); console.log(`  ${C.red}✗ ${label}${C.reset}\n      ${C.gray}expected${C.reset} ${JSON.stringify(expected)}  ${C.gray}got${C.reset} ${C.red}${JSON.stringify(actual)}${C.reset}`); }
}

const { server, port } = await serve();
const URL = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

try {
  console.log(`${C.bold}${C.cyan}▸ boot & onboarding${C.reset}`);
  await page.goto(URL);
  await page.waitForTimeout(1000);
  check('onboarding visible on fresh load', await page.evaluate(() => !document.getElementById('onboarding').classList.contains('hidden')));
  await page.evaluate(() => { obNext(); obNext(); obLoadSample(); });
  await page.waitForTimeout(600);
  check('main visible after sample data', await page.evaluate(() => !document.getElementById('main').classList.contains('hidden')));
  check('sample data has accounts + transactions', await page.evaluate(() => S.accounts.length > 0 && S.transactions.length > 0));

  console.log(`${C.bold}${C.cyan}▸ render-everything smoke (errorCount must be 0)${C.reset}`);
  const smoke = await page.evaluate(() => {
    const errs = []; const run = (n, fn) => { try { fn(); } catch (e) { errs.push(n + ': ' + e.message); } };
    document.querySelectorAll('.sheet,.confirm-overlay').forEach(e => e.remove());
    run('dashboard', () => { _currentTab = 'dashboard'; renderDashboard(); });
    run('transactions', renderTransactions);
    run('plan-budgets', () => { _planView = 'budgets'; renderPlan(); });
    run('plan-recurring', () => { _planView = 'subscriptions'; renderPlan(); });
    run('plan-calendar', () => { _planView = 'calendar'; renderPlan(); });
    run('analytics-3M', () => { _analyticsRange = '3M'; renderAnalytics(); });
    run('analytics-All', () => { _analyticsRange = 'All'; renderAnalytics(); });
    run('accounts', renderAccounts);
    run('settings', openSettings); run('addTx', openAddTxSheet);
    run('transfer', () => { openAddTxSheet(); setTxType('transfer'); });
    run('addRecurring', openAddRecurring); run('csvImport', openCSVImport);
    run('addAccount', openAddAccountSheet); run('addBudget', openAddBudgetSheet);
    run('categories', openCategoriesManager); run('catEditor', () => openCategoryEditor('food'));
    run('recurringMgr', openRecurringManager); run('analyticsLayout', openAnalyticsLayout);
    run('analyticsCatFilter', openAnalyticsCategoryFilter);
    run('wealthSheet', openWealthSheet); run('cloudSheet', openCloudBackupSheet);
    run('confirmDialog', () => confirmDialog({ title: 'x' }, () => {}));
    run('currencyPicker', () => openCurrencyPicker('EUR', () => {}));
    document.querySelectorAll('.sheet,.confirm-overlay').forEach(e => e.remove());
    return { errorCount: errs.length, errors: errs };
  });
  check(`render smoke errorCount=0${smoke.errorCount ? ' — ' + smoke.errors.join('; ') : ''}`, smoke.errorCount, 0);

  console.log(`${C.bold}${C.cyan}▸ interactions that broke before${C.reset}`);
  // CSV import file button must be a real, clickable input (a haptic overlay once hijacked it)
  await page.evaluate(() => { document.querySelectorAll('.sheet').forEach(e => e.remove()); openCSVImport(); });
  await page.waitForTimeout(200);
  check('CSV import exposes a file input', await page.evaluate(() => !!document.querySelector('#sheet-csv input[type=file]')));

  // A primary button fires its action exactly once
  const fireCount = await page.evaluate(() => {
    let n = 0; window.__fire = () => n++;
    openSheet('firetest', '<div class="sheet-body"><button class="btn-primary" id="fb" onclick="__fire()">Go</button></div>');
    document.getElementById('fb').click();
    document.querySelectorAll('.sheet').forEach(e => e.remove());
    return n;
  });
  check('primary button fires exactly once', fireCount, 1);

  // Merchant tap-through survives apostrophes AND does not execute injected code
  const inj = await page.evaluate(async () => {
    window.__pwned = 0;
    const today = new Date().toISOString().slice(0, 10);
    S.transactions.unshift({ id: '_a', type: 'expense', date: today, merchant: "O'Brien's Pub", category: 'food', originalAmount: 9999900, originalCurrency: 'EUR', convertedAmount: 9999900, accountId: S.accounts[0].id });
    S.transactions.unshift({ id: '_i', type: 'expense', date: today, merchant: "x');window.__pwned=1;('", category: 'food', originalAmount: 9999800, originalCurrency: 'EUR', convertedAmount: 9999800, accountId: S.accounts[0].id });
    saveState();
    _currentTab = 'analytics'; _analyticsRange = '1M'; renderAnalytics();
    await new Promise(r => setTimeout(r, 120));
    const rows = [...document.querySelectorAll('.merchant-row')];
    const apos = rows.find(r => r.textContent.includes("O'Brien"));
    const injRow = rows.find(r => (r.getAttribute('onclick') || '').includes('pwned'));
    apos && apos.click();
    const aposSearch = _txSearch;
    _currentTab = 'analytics'; renderAnalytics(); await new Promise(r => setTimeout(r, 120));
    const injRow2 = [...document.querySelectorAll('.merchant-row')].find(r => (r.getAttribute('onclick') || '').includes('pwned'));
    injRow2 && injRow2.click();
    return { aposSearch, pwned: window.__pwned, injSearch: _txSearch };
  });
  check("apostrophe merchant taps through (filter = exact name)", inj.aposSearch, "O'Brien's Pub");
  check('injection merchant executes NO code', inj.pwned, 0);
  check('injection merchant value preserved as data', inj.injSearch, "x');window.__pwned=1;('");

  // Analytics "All" range is clamped (no ~300-column heatmap)
  const cols = await page.evaluate(() => { _currentTab='analytics'; _analyticsRange='All'; renderAnalytics(); const g = document.querySelector('.hm-grid'); return getMonthsInRange('All').length; });
  check('Analytics "All" range is clamped (<24 months)', cols < 24);

  // Add a transaction through the real form → persists
  const added = await page.evaluate(async () => {
    document.querySelectorAll('.sheet').forEach(e => e.remove());
    const before = S.transactions.length;
    openAddTxSheet();
    await new Promise(r => setTimeout(r, 100));
    document.getElementById('tx-amount').value = '12.34';
    document.getElementById('tx-merchant').value = 'UI Smoke Cafe';
    saveTx();
    await new Promise(r => setTimeout(r, 100));
    return { delta: S.transactions.length - before, top: S.transactions[0].merchant };
  });
  check('add-transaction persists one row', added.delta, 1);
  check('added transaction is at top', added.top, 'UI Smoke Cafe');

  // JSON backup round-trip (mergeSavedState) keeps data
  const rt = await page.evaluate(() => {
    const restored = mergeSavedState(JSON.parse(JSON.stringify(S)));
    return restored.transactions.length === S.transactions.length && restored.accounts.length === S.accounts.length;
  });
  check('JSON backup round-trip preserves counts', rt);

  // Cloud backup sheet renders (unconfigured state shows setup + guide link)
  const cloud = await page.evaluate(() => { document.querySelectorAll('.sheet').forEach(e => e.remove()); openCloudBackupSheet(); return { setup: !!document.getElementById('cloud-url'), guide: !!document.querySelector('#sheet2-cloud-backup a[href*="CLOUD-SETUP"]') }; });
  check('cloud backup sheet shows setup fields', cloud.setup);
  check('cloud backup sheet links the setup guide', cloud.guide);

  console.log(`${C.bold}${C.cyan}▸ no uncaught page errors${C.reset}`);
  check(`zero page errors${pageErrors.length ? ' — ' + pageErrors.join('; ') : ''}`, pageErrors.length, 0);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${C.bold}──────────────────────────────${C.reset}`);
console.log(`${C.bold}${passed + failed} checks${C.reset}  ${C.green}${passed} passed${C.reset}  ${failed ? C.red : C.gray}${failed} failed${C.reset}`);
if (failed) { console.log(`${C.red}Failures:${C.reset}`); fails.forEach(f => console.log(`  ${C.red}•${C.reset} ${f}`)); }
process.exit(failed ? 1 : 0);
