// === CLOUD BACKUP (Supabase) ===
// Optional, self-hosted-by-the-user: they create a free Supabase project once (see
// CLOUD-SETUP.md), paste its URL + anon key here, and sign in with an email code.
// The whole app state is then encrypted ON DEVICE (PBKDF2 → AES-GCM, passphrase never
// leaves the phone) and upserted to a single row the user's account owns. Auto-backup
// piggybacks on saveState() with a debounce. Plain fetch against GoTrue/PostgREST —
// no SDK, keeping the no-build vanilla setup.

const CLOUD_SESSION_KEY = 'financeapp_cloud_session'; // tokens — device-local, never in backups
const CLOUD_PASS_KEY = 'financeapp_cloud_pass';       // encryption passphrase — device-local on purpose:
// localStorage already holds the plaintext data, so keeping the passphrase here protects the
// SERVER copy without pretending to add local security. A new device must re-enter it.

function cloudCfg() { return (S && S.settings && S.settings.cloud) || null; }
function cloudSession() {
  try { return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)) || null; } catch(e) { return null; }
}
function setCloudSession(s) {
  if (s) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(CLOUD_SESSION_KEY);
}
function cloudPass() { return localStorage.getItem(CLOUD_PASS_KEY) || null; }
function cloudEnabled() { const c = cloudCfg(); return !!(c && c.url && c.anonKey); }
function cloudSignedIn() { return !!cloudSession(); }
function cloudActive() { return cloudEnabled() && cloudSignedIn() && !!cloudPass(); }

// --- crypto: passphrase → AES-GCM key; payload format {v,salt,iv,ct} (all base64) ---
// Chunked: spreading a whole ciphertext into fromCharCode(...) overflows the call stack on
// real-sized backups (hit on iOS Safari with a few months of history).
function _b64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function _unb64(str) { return Uint8Array.from(atob(str), c=>c.charCodeAt(0)); }
async function _deriveKey(passphrase, salt) {
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'},
    raw, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function encryptPayload(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await _deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(plaintext));
  return {v:1, salt:_b64(salt), iv:_b64(iv), ct:_b64(ct)};
}
async function decryptPayload(payload, passphrase) {
  const key = await _deriveKey(passphrase, _unb64(payload.salt));
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:_unb64(payload.iv)}, key, _unb64(payload.ct));
  return new TextDecoder().decode(pt);
}

// --- Supabase REST helpers ---
async function _gotrue(path, body, extraHeaders={}) {
  const c = cloudCfg();
  const res = await fetch(`${c.url}/auth/v1/${path}`, {
    method:'POST',
    headers:{apikey:c.anonKey, 'Content-Type':'application/json', ...extraHeaders},
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || `HTTP ${res.status}`);
  return data;
}
function _adoptSession(data) {
  setCloudSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + ((data.expires_in||3600)-60)*1000,
    user_id: data.user?.id,
    email: data.user?.email,
  });
}
// Valid access token, refreshing if near expiry. Signs out on a dead refresh token.
async function cloudToken() {
  const s = cloudSession();
  if (!s) throw new Error('Not signed in');
  if (Date.now() < s.expires_at) return s.access_token;
  try {
    const data = await _gotrue('token?grant_type=refresh_token', {refresh_token: s.refresh_token});
    _adoptSession(data);
    return data.access_token;
  } catch(e) { setCloudSession(null); throw new Error('Session expired — sign in again'); }
}
// Email + password auth. Chosen over OTP codes because Supabase's built-in mailer no longer
// allows editing email templates (the 6-digit code can't be shown without custom SMTP), and
// password sign-in needs no email at all once "Confirm email" is off in the project.
// Sign In and Create Account are DELIBERATELY separate actions: an earlier combined button
// re-interpreted a wrong password as "new user" and sent people chasing confirmation emails
// that were never sent.
async function cloudSignIn(email, password) {
  const data = await _gotrue('token?grant_type=password', {email, password});
  _adoptSession(data);
}
// Returns 'signed-up' (session live) or 'confirm-email' (project still requires confirmation).
// Throws "already has an account" for existing emails — Supabase signals that with a fake
// user object whose identities list is empty (anti-enumeration), or an explicit error.
async function cloudSignUp(email, password) {
  const su = await _gotrue('signup', {email, password});
  if (su.access_token) { _adoptSession(su); return 'signed-up'; }
  const ids = su.user ? su.user.identities : su.identities;
  if (ids && ids.length === 0) throw new Error('This email already has an account — use Sign In');
  return 'confirm-email';
}
// Magic-link fallback: adopt #access_token=…&refresh_token=… if the user tapped the email link.
function cloudHandleHash() {
  if (!location.hash.includes('access_token=')) return;
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('access_token') && p.get('refresh_token')) {
    setCloudSession({
      access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
      expires_at: Date.now() + (parseInt(p.get('expires_in')||'3600',10)-60)*1000,
      user_id: null, email: null,
    });
    history.replaceState(null, '', location.pathname + location.search);
    showToast('Signed in to cloud backup','success');
  }
}

// --- backup & restore ---
let _cloudTimer = null, _cloudBusy = false, _lastCloudSig = null;
// Signature of the data we'd back up, EXCLUDING the volatile cloud metadata (lastCloudBackupAt),
// so a backup writing its own timestamp doesn't look like a change and re-trigger itself. Used to
// skip redundant PBKDF2 + uploads when auto-backup fires but nothing actually changed.
function cloudStateSignature() {
  if (!S) return '';
  const { cloud, ...restSettings } = S.settings || {};
  return JSON.stringify({ ...S, settings: restSettings });
}
async function cloudBackupNow(silent=false) {
  if (!cloudActive() || _cloudBusy) return false;
  _cloudBusy = true;
  try {
    const token = await cloudToken();
    const c = cloudCfg();
    const enc = await encryptPayload(JSON.stringify(S), cloudPass());
    const res = await fetch(`${c.url}/rest/v1/cloud_backups?on_conflict=user_id`, {
      method:'POST',
      headers:{apikey:c.anonKey, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates'},
      body: JSON.stringify([{user_id: cloudSession().user_id, payload: JSON.stringify(enc), updated_at: new Date().toISOString()}]),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _lastCloudSig = cloudStateSignature(); // record what we just uploaded, before the timestamp write
    S.settings.cloud = {...cloudCfg(), lastCloudBackupAt: Date.now()};
    saveState(); // _cloudBusy still true → the schedule hook below ignores this save
    if (!silent) showToast('Backed up to cloud','success');
    if (typeof refreshSettingsIfOpen === 'function') refreshSettingsIfOpen();
    return true;
  } catch(e) {
    if (!silent) showToast(`Cloud backup failed: ${e.message}`,'error');
    return false;
  } finally { _cloudBusy = false; }
}
async function cloudFetchBackup() {
  const token = await cloudToken();
  const c = cloudCfg();
  const res = await fetch(`${c.url}/rest/v1/cloud_backups?select=payload,updated_at`, {
    headers:{apikey:c.anonKey, Authorization:`Bearer ${token}`},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}
async function cloudRestore() {
  try {
    const row = await cloudFetchBackup();
    if (!row) { showToast('No cloud backup found yet','info'); return; }
    const plain = await decryptPayload(JSON.parse(row.payload), cloudPass());
    const parsed = JSON.parse(plain);
    const txCount = parsed.transactions?.length ?? 0;
    const when = new Date(row.updated_at).toLocaleString();
    // If this device has edits that were never backed up, restoring an older cloud copy would
    // silently drop them — say so. (Signature is only known after a backup/restore this session,
    // so the warning appears exactly when there's a real local-vs-cloud divergence to lose.)
    const localDirty = _lastCloudSig !== null && cloudStateSignature() !== _lastCloudSig;
    const warn = localDirty ? ' ⚠️ You have changes on this device that are newer than any backup — they will be lost.' : '';
    confirmDialog({title:'Restore from cloud?', message:`This replaces your current data with the cloud backup from ${when} (${txCount} transactions).${warn}`, confirmLabel:'Restore', danger:true}, ()=>{
      const keepCloud = cloudCfg(); // session/config on THIS device wins over what's in the blob
      S = mergeSavedState(parsed);
      S.onboardingComplete = true;
      S.settings.cloud = {...(S.settings.cloud||{}), ...keepCloud};
      saveState(); applyTheme(); generateRecurring();
      _lastCloudSig = cloudStateSignature(); // we now match the cloud copy — don't re-upload it as a "change"
      const ob = document.getElementById('onboarding');
      if (ob && !ob.classList.contains('hidden')) enterApp();
      else renderCurrentTab();
      if (typeof refreshSettingsIfOpen === 'function') refreshSettingsIfOpen();
      showToast(`Restored ${txCount} transactions from cloud`,'success');
    });
  } catch(e) {
    showToast(e.message.includes('operation-specific') || e.name==='OperationError' ? 'Wrong passphrase for this backup' : `Restore failed: ${e.message}`,'error');
  }
}
// Called from saveState(): quiet, debounced, only when fully set up. The debounce batches
// bursts (an import saves once per step) into one upload.
function scheduleCloudBackup() {
  if (_cloudBusy || !cloudActive() || !(S.settings.cloud.auto ?? true)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (_lastCloudSig !== null && cloudStateSignature() === _lastCloudSig) return; // nothing changed since last backup
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(()=>cloudBackupNow(true), 4000);
}
// Best-effort backup when the app is being hidden/closed: the 4s auto-backup debounce means a
// last edit made right before backgrounding would otherwise never reach the cloud. Fires an
// immediate backup if there are unsaved-to-cloud changes. It may not finish if the OS freezes
// the page, but it usually gets the request out; the next launch backs up regardless.
function cloudFlushNow() {
  if (!cloudActive() || _cloudBusy) return;
  if (_lastCloudSig !== null && cloudStateSignature() === _lastCloudSig) return; // nothing pending
  clearTimeout(_cloudTimer);
  cloudBackupNow(true);
}
function initCloudBackup() {
  try { cloudHandleHash(); } catch(e) {}
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cloudFlushNow(); });
    window.addEventListener('pagehide', cloudFlushNow);
  }
}

// --- Settings UI ---
function openCloudBackupSheet() {
  document.getElementById('sheet2-cloud-backup')?.remove(); // re-render in place on state transitions, don't stack
  const c = cloudCfg();
  let body;
  if (!cloudEnabled()) {
    body = `
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:14px">
        Automatic, <strong>end-to-end encrypted</strong> backup to your own free Supabase project — your data is encrypted on this device before upload; the server only ever stores an unreadable blob.<br><br>
        One-time setup (~5 min): create the free project and paste two values below. Follow
        <a href="https://github.com/ivann9963/Personal-Finance/blob/main/CLOUD-SETUP.md" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">the step-by-step guide →</a>
      </div>
      <div class="form-field"><label class="form-label">Supabase Project URL</label>
        <input id="cloud-url" class="form-input" type="url" placeholder="https://xxxx.supabase.co" value="${escHtml(c?.url||'')}"></div>
      <div class="form-field"><label class="form-label">Publishable / anon key</label>
        <input id="cloud-key" class="form-input" type="text" placeholder="sb_publishable_… or eyJ…" value="${escHtml(c?.anonKey||'')}"></div>
      <button class="btn-primary" onclick="saveCloudConfig()">Save &amp; Continue</button>`;
  } else if (!cloudSignedIn()) {
    body = `
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:14px">
        <strong>First time?</strong> Create an account. <strong>Coming back</strong> (or restoring on a new phone)? Sign in with the same email and password.
      </div>
      <div class="form-field"><label class="form-label">Email</label>
        <input id="cloud-email" class="form-input" type="email" placeholder="you@example.com" value="${escHtml(c?.email||'')}"></div>
      <div class="form-field"><label class="form-label">Password</label>
        <input id="cloud-password" class="form-input" type="password" placeholder="min 6 characters"></div>
      <button class="btn-primary" id="cloud-signin-btn" onclick="cloudDoAuth('signin')">Sign In</button>
      <button class="btn-secondary" id="cloud-signup-btn" style="width:100%;margin-top:10px" onclick="cloudDoAuth('signup')">Create Account</button>
      <button class="btn-secondary" style="width:100%;margin-top:14px" onclick="resetCloudConfig()">Change project settings</button>`;
  } else if (!cloudPass()) {
    body = `
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:14px">
        Choose an <strong>encryption passphrase</strong>. Backups are encrypted with it on this device — the server can never read them.<br>
        ⚠️ <strong>Write it down.</strong> Without it a cloud backup cannot be decrypted — not by you, not by anyone.
      </div>
      <div class="form-field"><label class="form-label">Passphrase</label>
        <input id="cloud-pass" class="form-input" type="password" placeholder="min 8 characters"></div>
      <div class="form-field"><label class="form-label">Repeat passphrase</label>
        <input id="cloud-pass2" class="form-input" type="password"></div>
      <button class="btn-primary" onclick="saveCloudPass()">Enable Cloud Backup</button>
      <div style="font-size:12px;color:var(--text-tertiary);line-height:1.5;margin-top:12px">Restoring on a new device? Use the passphrase you chose back then.</div>`;
  } else {
    const last = c.lastCloudBackupAt ? relTimeSince(c.lastCloudBackupAt) : 'never';
    const auto = c.auto ?? true;
    body = `
      <div style="background:var(--bg-elevated);border-radius:var(--radius);padding:14px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:18px">☁️</span><span style="font-weight:700">Cloud backup is on</span></div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.5">
          Signed in as <strong>${escHtml(cloudSession().email||c.email||'…')}</strong><br>
          Last cloud backup: <strong>${last}</strong> · encrypted on device
        </div>
      </div>
      <div class="settings-row" onclick="toggleCloudAuto()" style="margin:0 0 14px">
        <div class="settings-row-icon" style="background:#1C2128">🔄</div>
        <div class="settings-row-info"><div class="settings-row-lbl">Auto-backup after changes</div><div class="settings-row-val">${auto?'On — backs up a few seconds after you edit':'Off — manual only'}</div></div>
        <div class="settings-row-right">${auto?'✅':'⭕'}</div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <button class="btn-primary" style="flex:1" onclick="cloudBackupNow()">Back Up Now</button>
        <button class="btn-secondary" style="flex:1" onclick="cloudRestore()">Restore</button>
      </div>
      <button class="btn-danger" style="width:100%" onclick="cloudSignOut()">Sign Out</button>`;
  }
  openSheet2('cloud-backup', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">☁️ Cloud Backup</div>
    <div class="sheet-body">${body}</div>`);
}
function saveCloudConfig() {
  const url = document.getElementById('cloud-url').value.trim().replace(/\/+$/,'');
  const anonKey = document.getElementById('cloud-key').value.trim();
  if (!/^https:\/\/.+\.supabase\.co$/.test(url)) { showToast('URL should look like https://xxxx.supabase.co','error'); return; }
  if (anonKey.length < 30) { showToast('That anon key looks too short','error'); return; }
  S.settings.cloud = {...(S.settings.cloud||{}), url, anonKey};
  saveState();
  openCloudBackupSheet();
}
function resetCloudConfig() {
  S.settings.cloud = null; setCloudSession(null); localStorage.removeItem(CLOUD_PASS_KEY);
  saveState(); openCloudBackupSheet();
}
async function cloudDoAuth(mode) {
  const email = document.getElementById('cloud-email').value.trim();
  const password = document.getElementById('cloud-password').value;
  if (!/.+@.+\..+/.test(email)) { showToast('Enter a valid email','error'); return; }
  if (password.length < 6) { showToast('Password needs at least 6 characters','error'); return; }
  const btnIn = document.getElementById('cloud-signin-btn');
  const btnUp = document.getElementById('cloud-signup-btn');
  btnIn.disabled = btnUp.disabled = true;
  (mode==='signin' ? btnIn : btnUp).textContent = mode==='signin' ? 'Signing in…' : 'Creating account…';
  const reset = () => { btnIn.disabled = btnUp.disabled = false; btnIn.textContent = 'Sign In'; btnUp.textContent = 'Create Account'; };
  try {
    if (mode === 'signin') {
      await cloudSignIn(email, password);
      showToast('Signed in','success');
    } else {
      const outcome = await cloudSignUp(email, password);
      if (outcome === 'confirm-email') {
        S.settings.cloud = {...cloudCfg(), email}; saveState();
        showToast('Account created, but your Supabase project requires email confirmation — tap the link it just emailed you, or turn OFF "Confirm email" in Supabase (setup guide step 3) and Sign In','warning',8000);
        reset(); return;
      }
      showToast('Account created — signed in','success');
    }
    S.settings.cloud = {...cloudCfg(), email}; saveState();
    openCloudBackupSheet();
  } catch(e) {
    let msg = e.message;
    if (/invalid login credentials/i.test(msg)) msg = 'Wrong email or password';
    else if (/email not confirmed/i.test(msg)) msg = 'This account still needs its confirmation email — check your inbox, or turn OFF "Confirm email" in Supabase and try again';
    else if (/already registered/i.test(msg)) msg = 'This email already has an account — use Sign In';
    showToast(msg,'error',5000);
    reset();
  }
}
function saveCloudPass() {
  const p1 = document.getElementById('cloud-pass').value;
  const p2 = document.getElementById('cloud-pass2').value;
  if (p1.length < 8) { showToast('Use at least 8 characters','error'); return; }
  if (p1 !== p2) { showToast('Passphrases don\'t match','error'); return; }
  localStorage.setItem(CLOUD_PASS_KEY, p1);
  if (!('auto' in (S.settings.cloud||{}))) S.settings.cloud = {...cloudCfg(), auto:true};
  saveState();
  openCloudBackupSheet();
  cloudBackupNow(); // first backup right away
}
function toggleCloudAuto() {
  S.settings.cloud = {...cloudCfg(), auto: !(cloudCfg().auto ?? true)};
  saveState(); openCloudBackupSheet();
}
function cloudSignOut() {
  confirmDialog({title:'Sign out of cloud backup?', message:'Backups stop until you sign in again. Data on this device is untouched.', confirmLabel:'Sign out', danger:true}, ()=>{
    setCloudSession(null); localStorage.removeItem(CLOUD_PASS_KEY);
    openCloudBackupSheet();
  });
}
