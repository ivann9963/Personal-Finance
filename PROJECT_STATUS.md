# Project Status — Finance PWA

_Last updated: 2026-06-15. Snapshot for picking the project back up after a break._

Live app: **https://ivann9963.github.io/Personal-Finance/**
Repo: **https://github.com/ivann9963/Personal-Finance**

## What this is
A personal finance tracker as a static, offline-first PWA. Vanilla HTML/CSS/JS, **no build step, no backend, no framework**. All data lives in the browser's `localStorage` (key `financeapp_v1`); each device/person has their own private data. Charting via Chart.js (CDN).

## Run / test / deploy
- **Run locally:** `python3 -m http.server 8000` → open http://localhost:8000
- **Tests:** `node tests/run.js` (dependency-free Node harness, currently **79 passing**)
- **Deploy:** push to `main` → GitHub Pages auto-publishes. Service worker is now **network-first**, so updates reach users on reload (no more stale cache).
- **On iPhone:** open the live URL in Safari → Share → Add to Home Screen.

## Architecture (files under `js/`)
- `config.js` — constants (currencies, categories, account types) + global state vars (`S`, `_currentTab`, …)
- `data.js` — `localStorage` load/save, currency format/convert, `learnMerchantCategory`
- `routing.js` — tab switching; `renderCurrentTab()` invalidates other tabs so they re-render fresh
- `pwa-init.js` — generates manifest + service worker (network-first), `init()`
- `onboarding.js` — first-run flow
- `dashboard.js` — net worth, sparkline, spending velocity, insights
- `transactions.js` — list, search, filters (incl. `cat:<id>` category filter), swipe edit/delete
- `tx-form.js` — add/edit transaction sheet (+ inline "New category" pill)
- `plan.js` — budgets (add/edit/delete) + calendar + subscriptions
- `analytics.js` — heatmap, spending trend, category donut (tap-through), top merchants, income vs expense
- `accounts.js` — accounts CRUD; savings-vault reconciliation
- `categories.js` — category add/edit/reorder/delete (reassigns to Other)
- `recurring-insights.js` — recurring engine + **recurring manager** + insights engine
- `import-export.js` — **CSV import** (the most complex area): parsing, category mapping, merchant inference, savings detection, manual review
- `sample-data.js`, `ui-components.js` — sample data + shared sheet/toast helpers
- `tests/` — `run.js` (cases) + `harness.js` (loads real modules in a sandboxed Node context)

## Done so far (chronological)
1. README + GitHub Pages live URL + iPhone instructions
2. iOS safe-area fix (`viewport-fit=cover`) — header/bottom-nav no longer cut off
3. UI/UX polish: toast below header, FAB/nav safe-area, edge-fades on horizontal scrollers, smoother income/expense switch, visible min progress bars
4. **CSV import** built up substantially:
   - Robust date parsing (ISO/EU/US/month-names/timestamps; ambiguous → European day/month) and European decimal amounts
   - Amount-sign convention option; **live interpreted preview** (shows how each row will save)
   - Smart category mapping (token-based, plural-tolerant); **merchant keyword inference** + **learns merchant→category from your history**
   - Revolut-aware: `Type` column no longer hijacks category; transfers/exchanges/top-ups classified out of spending; zero-amount rows skipped
   - **Manual review** step: unmatched merchants grouped with a category dropdown
5. New **Groceries** category; fixed merchant "Unknown" fallback + category over-grouping
6. Analytics: donut center total; tap a category/merchant → filtered transactions (with clear banner)
7. **Savings vaults** modeled as accounts (Reserves Fund, Savings Vault, …): deposits/withdrawals routed there, round-ups tagged, balance in Net Worth; **editable balance reconciliation** (set real balance, survives imports); **automatic recurring contributions**
8. **Critical CRUD added:** edit categories (rename/emoji/color), inline add-category from tx form, recurring/subscriptions manager (pause/delete), budget edit/delete, "Delete all transactions"
9. Fixes: edit sheet closing instantly; analytics range-selector highlight; service-worker update strategy

## Known limitations / what's left
- **Transfers between your own accounts**: the `transfer` type exists but the tx form doesn't let you pick a *destination* account / move money between two of your accounts.
- **Reassign-on-delete** always sends a deleted category's transactions to "Other" (no pick-target).
- **No cloud sync / backup-by-default** — data is per-device. JSON export/import exists in Settings; consider reminding users to back up.
- **Round-up automation** for *manually-added* transactions (Revolut-style "round to nearest €1 into a vault") is not built — only imported round-ups are tracked.
- **Editing a recurring schedule's amount/merchant** isn't possible (only pause/resume/delete + recreate).
- **Merchant keyword rules** are a seed list; long-tail/local merchants rely on the learning system (categorize once → remembered).
- **No multi-currency net-worth nuance** beyond manual exchange rates entered on transactions.
- **Tests** cover the import/data logic well; UI flows are verified manually via Playwright scripts (not committed) — no automated UI test suite.

## Possible next steps (ideas, unprioritized)
- Account-to-account transfer UI (pick source + destination).
- Savings goals / progress bars per vault; savings summary view.
- Round-up automation toggle for new transactions.
- Edit recurring schedule details.
- Onboarding note clarifying "your data stays on your device".
- CSV import: remember column mapping per bank; import history / undo-last-import (transactions already tagged with `importBatch`).
- Optional cloud backup/sync.

## Gotchas to remember
- Service worker is now network-first; if testing offline behavior, account for that.
- After deploying, the **old installed PWA** needs one clean reload (or remove/re-add to Home Screen) to adopt the new service worker.
- `localStorage` ~5MB limit; app warns near 4MB on save.
- All amounts stored as integer **cents**; categories referenced by stable `id` (renaming is safe).
