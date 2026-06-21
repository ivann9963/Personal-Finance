# Project Status — Finance PWA

_Last updated: 2026-06-21. Snapshot for picking the project back up after a break._

Live app: **https://ivann9963.github.io/Personal-Finance/**
Repo: **https://github.com/ivann9963/Personal-Finance**

> **Handoff (2026-06-21):** Everything below is committed & pushed to `main` and live. Working tree is clean. Latest commit `7dd0549`. Tests: **91 passing**. This session shipped items **#10–#24** below (transfers, settings/backup overhaul, subscriptions hub + discoverable recurring, UX sweep, the sheet-animation fix, drag-reorder + custom dialogs, and full Analytics customization). **What's left** is the "Possible next steps" section near the bottom — start there.

## What this is
A personal finance tracker as a static, offline-first PWA. Vanilla HTML/CSS/JS, **no build step, no backend, no framework**. All data lives in the browser's `localStorage` (key `financeapp_v1`); each device/person has their own private data. Charting via Chart.js (CDN).

## Run / test / deploy
- **Run locally:** `python3 -m http.server 8000` → open http://localhost:8000
- **Tests:** `node tests/run.js` (dependency-free Node harness, currently **91 passing**)
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
10. **Account-to-account transfers**: Transfer type shows From/To account selectors (with a "need 2 accounts" guard), hides categories, and moves money between accounts on save/edit/delete/duplicate. `applyTransferBalances()` (in `accounts.js`) adjusts **non-vault** balances with currency conversion; **vault** endpoints are derived, so transfers into/out of a vault are counted by `vaultNetFlows()` and applied via `recomputeVaultBalances()` — this keeps a transfer from being silently wiped on the next import. Destination accounts also list incoming transfers in their ledger.
11. **Savings goals**: Any account can have a `goalAmount`; account cards show a mini progress bar; the detail sheet shows a full goal block with amount remaining / reached callout.
12. **Edit recurring schedules**: Each schedule in the recurring manager has an Edit (✎) button. The sheet edits merchant, amount, currency, frequency, **account**, **start/next date**, and category. Future auto-generated entries are dropped and regenerated with the new values; past transactions are preserved.
13. **Cross-tab reactivity fixes**: every mutation now keeps *all* views fresh, not just the visible one. Split `invalidateOtherTabs()` out of `renderCurrentTab()` (`routing.js`) and wired it into the mutations that previously only re-rendered their own view: **account add/edit/delete** (dashboard net worth + insights were going stale), **budget add/delete** (dashboard insights), and **category reorder** (order shown in analytics + tx form). Adding an expense/transfer already propagated; these were the gaps. Verified each path re-invalidates the right tabs.
14. **Settings restructured + Backup made prominent**: ditched the "Data" junk drawer. Groups are now Backup & Restore / Preferences / Manage (Categories, Recurring) / Import & Export / Danger Zone. A top **Backup card** shows "last backup N days ago" and turns amber/warns when stale (>14 days with real data); `exportJSON()` records `settings.lastBackupAt`. "Load Sample Data" is hidden once you have real transactions. Helpers `settingsRow()`, `relTimeSince()`, `backupStatus()`, `refreshSettingsIfOpen()`.
15. **Subscriptions hub** (Plan → new *Subscriptions* segment): headline monthly + annual total over all active recurring expenses, sorted by next charge date, "due soon" highlight, tap-to-edit. Fixed a real bug — the old mini-list summed amounts **without normalizing frequency** (a €120/yr sub counted as €120/mo). New `monthlyEquivalent()` normalizes every cadence; `recurringExpenseSchedules()`, `nextChargeDate()` added. Budgets view now shows a compact "recurring payments" teaser linking here.
16. **Fixed confusing UI signals**: (a) budget cards no longer show a green "−41%" pill next to a maxed-red bar — the month-over-month trend moved to the footer as a neutral "↓41% vs last mo", leaving budget status as the only colored signal; (b) the **Net Worth sparkline now actually renders** — `mkSparkline()` was missing `labels`, so Chart.js drew nothing (the hero card looked empty); (c) "Week starts on" is now a proper Monday/Sunday picker instead of an ambiguous toggle.
17. **Smarter onboarding**: welcome step carries a "🔒 your data is stored only on this device — back it up" note; final step offers three real paths — **Import from my bank (CSV)** (creates a starter account if needed, then opens the importer), Load sample data, or Start fresh. `showOnboarding()` now hides the FAB (fixes overlap when re-entered via Clear All Data).
18. **Stale-backup reminder**: the dashboard shows a red "No recent backup" banner (with Back Up Now + dismiss) when `backupStatus().stale` and not snoozed in the last 7 days. Reuses the ATH-banner style; `backupNowFromDashboard()` / `snoozeBackupReminder()` in `dashboard.js`.
19. **Undo last import**: `runCSVImport()` records `S.lastImport = {batch,count,at}`; Settings → Import & Export shows "Undo last import (N)" which removes that batch's transactions, recomputes vault balances, and drops any now-empty auto-created savings vaults. Your own (non-imported) transactions are untouched.
20. **Reassign-on-delete category**: deleting a category that's in use now opens an in-place picker to choose where its transactions move (default Other), instead of silently dumping everything into Other. `finalizeDeleteCategory(id,target)` does the move + cleanup.
21. **UX sweep / first-impression polish** (benchmarked vs Actual Budget / Ivy Wallet / Firefly III — our edge is mobile-first speed + delight):
    - **Inviting empty-state dashboard**: a brand-new user now sees a 👋 welcome with four tappable next steps (add transaction / add account / import from bank / explore sample data) instead of an empty €0 hero + pointless velocity strip + flat sparkline. `getStartedRow()`, `dashboardImport()` in `dashboard.js`.
    - **Hero trend delta**: the Net Worth card shows "▲/▼ €X · last 30 days" (net cash flow) so the headline number means something.
    - **One banner at a time**: backup nudge outranks the install hint; never both stacked.
    - **No premature backup nagging**: `settings.createdAt` (stamped on first save) gives new users a grace period — `backupStatus()` is stale only after >14 days since last backup, or >3 days since first use if never backed up.
    - **Believable sample data**: supermarkets (Lidl/Aldi/Kaufland/Penny/Rewe) are now **Groceries** not Food, so the demo's analytics look right (Food dropped 44%→12%, Groceries is its own 29% slice) and showcase the category. Added a groceries budget.
    - **Expense sign consistency**: transaction rows show "−€X" (matching the day-total signs); income "+", transfers none.
22. **Interaction fixes (weird UX)**:
    - **Drag-to-reorder categories**: replaced the ↑/↓ buttons (which needed ~17 taps to move a category across the list) with proper drag-to-reorder — a ≡ handle, the lifted row follows the finger, others slide to open a gap (pointer events, `setupCatReorder()` in `categories.js`). Order feeds analytics + the tx-form pills.
    - **Custom confirm dialog**: `confirmDialog()` (`ui-components.js`) — a centered modal above all sheets — replaced **all 7** native `confirm()`/`prompt()` calls (delete account/category/recurring, undo import, restore backup, delete-all-transactions, clear-all-data). Native dialogs showed the domain and broke immersion.
    - **Emoji quick-pick grid** in the category editor (was a bare text field; now a grid matching the color-dot picker, with a text field for custom emoji). Fixed stale "N transactions will become Other" delete text (deletion now offers a reassign picker).
23. **Recurring expenses made discoverable**: previously the only way to add a recurring expense was to toggle "Recurring" deep in the tx form. Added `openAddRecurring()` (opens the tx form pre-set to a recurring expense — toggle on, frequency visible; `openAddTxSheet` honors `prefill.recurring`) and **"+ Add recurring payment"** buttons in **Plan → Subscriptions** (populated + empty) and **Settings → Recurring & Subscriptions** (populated + empty). Tracking lives in the Subscriptions hub (total/month + next charge).
24. **Analytics customization** (all 4 requested options done): **(a) Reorder sections** — drag list, order in `settings.analyticsOrder`, `renderAnalyticsContent()` emits a `{id:html}` map in that order. **(b) Per-section sort** — dropdowns on Heatmap/Breakdown (Amount / My order / Name / Most used) + Top Merchants (Amount / Name / Most used), persisted in `settings.analyticsSort`. **(c) Custom category order** is the "My order" sort mode (follows `S.categories`). **(d) Show/hide categories** — 👁 button → sheet toggling `settings.analyticsHiddenCats`, filters Heatmap + Breakdown. Helpers in `analytics.js`: `ANALYTICS_SECTIONS`, `currentAnalyticsOrder`, `openAnalyticsLayout`, `setupSectionReorder`, `analyticsSort`, `setAnalyticsSort`, `sortCategoryIds`, `sortMerchantEntries`, `analyticsHidden`, `openAnalyticsCategoryFilter`, `toggleAnalyticsCat`.

25. **Bug fix — Analytics drill-down ignored the date range** (reported 2026-06-21): tapping a category in the Category Breakdown (or a merchant in Top Merchants) opened the transactions list filtered by category/merchant but across **all time** — so a "Last 3 months" drill showed year-old transactions. Added `_txDateFilter {start,end,label}` (config.js); `filterByCategory`/`filterByMerchant` set it from the current Analytics range via `analyticsRangeFilter()` (null for "All"); `renderTxList` applies it and the filter banner shows the period (e.g. "🛒 Groceries · Last 3 months · 36 transactions · Clear"). Tapping a filter chip clears it; `clearTxDrill()` resets filter+search+date. Verified across all ranges (1M/3M/6M/1Y/All) for both category and merchant drills with a 400-day tripwire transaction (excluded from short ranges, present in All).

## Known limitations / what's left
- **No cloud sync / backup-by-default** — data is per-device. Backup/restore is front-and-center in Settings, with a staleness reminder on the dashboard, but it's still manual (no automatic/scheduled backup).
- **"Subscriptions" includes all recurring expenses** (rent, utilities, not just streaming) — useful as a total-commitment view, but the label may surprise users who expect only subscriptions.
- **Round-up automation** for *manually-added* transactions (Revolut-style "round to nearest €1 into a vault") is not built — only imported round-ups are tracked.
- **Merchant keyword rules** are a seed list; long-tail/local merchants rely on the learning system (categorize once → remembered).
- **No multi-currency net-worth nuance** beyond manual exchange rates entered on transactions.
- **Tests** cover the import/data logic well; UI flows are verified manually via Playwright scripts (not committed) — no automated UI test suite.

## What's left (prioritized — start here next session)
_Analytics customization (reorder / sort / custom order / show-hide) is **fully done** — see item #24 above._

1. **Rename "Subscriptions" → "Recurring"** (small, quick win). The Plan segment is labelled "Subscriptions" but includes rent/bills/utilities, so the total (e.g. Landlord €900) surprises people. Either rename the segment to "Recurring", or split true subscriptions from bills. Touch points: `plan.js` (segment button + `renderSubscriptions`), wording in `recurring-insights.js`.
2. **Cloud / automatic backup** (biggest "would I pay" lever, but an architecture decision). Today: manual JSON backup + dashboard staleness reminder. Options: lightweight no-backend (scheduled prompt / auto-download to Files-iCloud) vs. real sync (needs infra — iCloud/Dropbox file or a small server). Decide direction before building.
3. **Round-up automation** for manually-added transactions (Revolut-style "round to nearest €1 into a vault"). Only imported round-ups are tracked today.
4. **Paused recurring visibility**: paused subscriptions vanish from the Plan → Subscriptions hub (only shown in the manager). Could show them greyed with a "paused" tag.
5. **CSV import niceties**: remember column mapping per bank; multi-level import history (only the last batch is undoable now — `S.lastImport`).
6. **Automated UI tests**: logic is covered (91 tests in `tests/run.js`), but UI flows are verified manually. Consider committing a Playwright/Puppeteer smoke suite.

**Verification tip (learned this session):** motion/animation quality can't be checked with screenshots — sample `getBoundingClientRect()` over time, or step the animation. The preview browser also caches JS per-file aggressively; to test current code, fetch each `js/*.js` with `{cache:'no-store'}` and `eval` it into the page (the `S`/`_*` globals persist from the initial load).

## Gotchas to remember
- **Animation easing:** `--spring` (cubic-bezier(.34,1.56,.64,1)) *overshoots* — only use it on small elements (FAB, toggle knob, nav icon, toast). Never on edge-anchored surfaces: bottom sheets used it and the overshoot lifted the sheet ~80px off the bottom edge mid-open, flashing the background (looked awful). Sheets now use `--ease-sheet` (cubic-bezier(.32,.72,0,1), no overshoot). Verify motion by sampling `getBoundingClientRect()` over time — screenshots can't catch it.
- Service worker is now network-first; if testing offline behavior, account for that.
- After deploying, the **old installed PWA** needs one clean reload (or remove/re-add to Home Screen) to adopt the new service worker.
- `localStorage` ~5MB limit; app warns near 4MB on save.
- All amounts stored as integer **cents**; categories referenced by stable `id` (renaming is safe).
