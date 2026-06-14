# Finance

A personal finance tracker — offline-first, private, no sign-up. Plain HTML/CSS/JS, no build step required.

## Running locally

Because the app registers a service worker, it needs to be served over `http://` (opening `index.html` directly via `file://` will work but without offline support).

From the project root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

Any other static file server works too, e.g.:

```bash
npx serve .
```

## Running the tests

Unit tests cover the CSV-import logic (date/amount parsing, category mapping, merchant
inference, transfer detection, and the learned-merchant memory). They run in plain Node — no
dependencies, no browser:

```bash
node tests/run.js
```

You'll get colored per-case output and a pass/fail summary; the process exits non-zero if any
test fails (handy for CI). Tests live in [tests/](tests/):

- `tests/run.js` — the test cases and a tiny assertion framework.
- `tests/harness.js` — loads the real `js/*.js` modules into a sandboxed Node context with
  minimal DOM/storage stubs, so the actual app code is exercised (not a copy).

To add cases, drop them into the relevant `suite(...)` block in `tests/run.js`.

## Opening on iPhone

### Option A: Live URL (recommended)

The app is hosted via GitHub Pages at:

**https://ivann9963.github.io/Personal-Finance/**

Just open that link in Safari on your iPhone, then tap the **Share** button → **Add to Home Screen** to install it as a full-screen PWA with offline support.

(If the page isn't live yet, enable it under repo **Settings → Pages**, source: `main` branch, root folder.)

### Option B: Local network

1. Make sure your iPhone is on the **same Wi-Fi network** as your Mac.
2. Start the server as above (`python3 -m http.server 8000`).
3. Find your Mac's local IP address:
   ```bash
   ipconfig getifaddr en0
   ```
4. On your iPhone, open Safari and go to `http://<your-mac-ip>:8000` (e.g. `http://192.168.100.209:8000`).
5. Tap the **Share** button → **Add to Home Screen**.

> Note: the local dev server has no HTTPS, so some PWA features (like the service worker) may behave differently than on the deployed HTTPS site, but the app itself works fine either way.
