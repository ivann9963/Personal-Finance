# Pre-ship smoke test — DO THIS before declaring any change "done"

This exists because a change once shipped that **passed unit tests but broke the app at
runtime** (a button overlay killed CSV import + button taps). Unit tests (`node tests/run.js`)
cover data/logic only — they cannot catch DOM/interaction/animation regressions. So before
pushing, run BOTH the unit tests and the in-browser smoke below.

## 1. Static (always)
```
node tests/run.js                 # must be all-pass
for f in js/*.js; do node --check "$f"; done   # must all parse
grep -rnE "TODO|FIXME|WIP" js/    # nothing half-done
git status --short                # commit everything; never leave the tree dirty at session end
```

## 2. In-browser smoke (paste into the preview / console after loading the app)
Exercises every render path + every sheet entry point and reports any throw. **Must return
`errorCount: 0`.** Also separately verifies the two things most easily broken by overlays/handlers:
CSV import's file button and that buttons fire exactly once.

```js
(()=>{
  const R={},errs=[]; const run=(n,fn)=>{try{fn();}catch(e){errs.push(n+': '+e.message);}};
  if(!S.accounts.length) loadSampleData(); S.onboardingComplete=true;
  document.querySelectorAll('.sheet,.confirm-overlay').forEach(e=>e.remove());
  run('dashboard',()=>{_currentTab='dashboard';renderDashboard();});
  run('transactions',renderTransactions);
  run('plan-budgets',()=>{_planView='budgets';renderPlan();});
  run('plan-recurring',()=>{_planView='subscriptions';renderPlan();});
  run('plan-calendar',()=>{_planView='calendar';renderPlan();});
  run('analytics',renderAnalytics); run('accounts',renderAccounts);
  run('settings',openSettings); run('addTx',openAddTxSheet);
  run('transfer',()=>{openAddTxSheet();setTxType('transfer');});
  run('addRecurring',openAddRecurring); run('csvImport',openCSVImport);
  run('addAccount',openAddAccountSheet); run('addBudget',openAddBudgetSheet);
  run('categories',openCategoriesManager); run('catEditor',()=>openCategoryEditor('food'));
  run('recurringMgr',openRecurringManager); run('analyticsLayout',openAnalyticsLayout);
  run('analyticsCatFilter',openAnalyticsCategoryFilter);
  run('confirmDialog',()=>confirmDialog({title:'x'},()=>{}));
  run('currencyPicker',()=>openCurrencyPicker('EUR',()=>{}));
  document.querySelectorAll('.sheet,.confirm-overlay').forEach(e=>e.remove());
  return {errorCount:errs.length, errors:errs};
})()
```

## 3. Interaction spot-checks (the classes of bug unit tests miss)
- **CSV import:** Settings → Import from bank → "Choose File" must open the file dialog.
- **Buttons fire once:** tap a primary button (Save) — its action runs exactly once, not 0 or 2×.
- **Motion:** if you touched a sheet/animation, sample `getBoundingClientRect()` over time — a
  screenshot cannot show motion. (An overshoot easing once lifted bottom sheets off-screen.)
- **Haptic overlays:** never overlay a `<label>`/file-input/link; fire actions explicitly via
  `el.click()`, never rely on a tap bubbling through the switch (iOS won't).

## 4. After deploy
The service worker is network-first, but an installed PWA still needs one clean reload to adopt
new files. A **partially-cached** bundle (new index.html + old JS, or vice-versa) looks broken —
if "everything is broken," suspect the cache first: pull-to-refresh or reopen the PWA.

## Rule
**End every session with: tree clean, pushed, `node tests/run.js` green, and the in-browser smoke
at `errorCount: 0`.** If you can't verify, say so explicitly rather than claiming "done".
