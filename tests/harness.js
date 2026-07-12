// Test harness: loads the browser-global app modules into a sandboxed Node context
// (with minimal DOM/storage stubs) so the REAL functions can be unit-tested without a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
// Order matters: config defines constants/state, the rest depend on it.
const FILES = ['config.js', 'data.js', 'recurring-insights.js', 'import-export.js', 'plan.js', 'wealth.js', 'accounts.js', 'cloud-backup.js'];

function loadApp() {
  const sandbox = {
    console,
    Intl,                                   // Node has full Intl
    document: { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} } }), head: { appendChild(){} } },
    localStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } },
    Blob: class { constructor(p){ this.size = (p && p[0] && p[0].length) || 0; } },
    navigator: {}, window: {},
    showToast: () => {},                    // UI no-op
    requestAnimationFrame: () => {},
    // WebCrypto + encoding globals for cloud-backup's encryption (Node ≥20 has them all)
    crypto, TextEncoder, TextDecoder, btoa, atob, setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  let src = FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
  // Expose the functions/state we want to drive from tests (same lexical scope = can reassign let bindings).
  src += `
    ;globalThis.__app = {
      parseDateStr, parseAmountStr, mapCategoryValue, inferCategoryFromMerchant,
      classifyByDescription, classifySavingsFlow, interpretCSVRow, learnMerchantCategory, defaultState, getCatInfo,
      mergeSavedState,
      projectWealth, monthsToReach, avgMonthlySavings, netWorthNow, investmentGain, investmentSummary, applyTransferBalances,
      holdingValue, holdingsValue, holdingGain, recordValuePoint, syncHoldingsValue,
      encryptPayload, decryptPayload, cloudEnabled, cloudActive, scheduleCloudBackup,
      gridToCSVData, autoMapColumns,
      vaultNetFlows, recomputeVaultBalances,
      monthlyEquivalent, recurringExpenseSchedules, nextChargeDate,
      getState: () => S,
      setState: (v) => { S = v; },
      setMapping: (v) => { _csvMapping = v; },
      setOverrides: (v) => { _csvMerchantOverrides = v; },
    };`;
  vm.runInContext(src, sandbox, { filename: 'app-bundle.js' });
  return sandbox.__app;
}

module.exports = { loadApp };
