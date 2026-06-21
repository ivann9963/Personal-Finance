// === UI COMPONENTS — SHEETS / TOASTS ===
let _sheetStack = [];
function openSheet(id, html, zIndex=1000) {
  // Close any existing primary sheets first (reset stack)
  document.querySelectorAll('#sheets .sheet:not([id^="sheet2-"])').forEach(el => el.remove());
  _sheetStack = [];
  document.getElementById('backdrop2').classList.remove('visible');
  const div = document.createElement('div');
  div.className = 'sheet';
  div.id = 'sheet-'+id;
  div.style.zIndex = zIndex;
  div.innerHTML = html;
  document.getElementById('sheets').appendChild(div);
  setupSheetSwipe(div, () => closeTopSheet());
  const bd = document.getElementById('backdrop');
  bd.style.zIndex = zIndex - 1;
  bd.classList.add('visible');
  requestAnimationFrame(()=> requestAnimationFrame(()=> div.classList.add('open')));
  haptic('light');
  _sheetStack.push(id);
}
function openSheet2(id, html) {
  const div = document.createElement('div');
  div.className = 'sheet';
  div.id = 'sheet2-'+id;
  div.style.zIndex = 1200;
  div.innerHTML = html;
  document.getElementById('sheets').appendChild(div);
  setupSheetSwipe(div, () => closeTopSheet2());
  document.getElementById('backdrop2').classList.add('visible');
  requestAnimationFrame(()=>requestAnimationFrame(()=>div.classList.add('open')));
}
function closeTopSheet() {
  const id = _sheetStack.pop();
  const el = id ? document.getElementById('sheet-'+id) : null;
  if (el) {
    el.style.transition = 'transform 260ms ease-in';
    el.classList.remove('open');
    setTimeout(()=>{ el.style.transition=''; el.remove(); }, 270);
  }
  if (_sheetStack.length === 0) {
    document.getElementById('backdrop').classList.remove('visible');
  }
}
function closeTopSheet2() {
  const el = document.querySelector('#sheets [id^="sheet2-"]');
  if (el) {
    el.style.transition = 'transform 260ms ease-in';
    el.classList.remove('open');
    setTimeout(()=>{ el.style.transition=''; el.remove(); }, 270);
  }
  document.getElementById('backdrop2').classList.remove('visible');
}
function closeAllSheets() {
  document.querySelectorAll('#sheets .sheet').forEach(el => el.remove());
  document.getElementById('backdrop').classList.remove('visible');
  document.getElementById('backdrop2').classList.remove('visible');
  _sheetStack = [];
}
// Centered confirm modal — replaces native confirm()/prompt() for a consistent, non-jarring feel.
// Has its own overlay above all sheets, so it works even when triggered from inside a sheet.
// confirmDialog('Message', onConfirm) or confirmDialog({title,message,confirmLabel,cancelLabel,danger}, onConfirm)
function confirmDialog(opts, onConfirm) {
  const o = typeof opts === 'string' ? {message:opts} : (opts||{});
  const { title='Are you sure?', message='', confirmLabel='Confirm', cancelLabel='Cancel', danger=false } = o;
  const wrap = document.createElement('div');
  wrap.className = 'confirm-overlay';
  wrap.innerHTML = `
    <div class="confirm-card" role="dialog" aria-modal="true">
      <div class="confirm-title">${escHtml(title)}</div>
      ${message?`<div class="confirm-msg">${escHtml(message)}</div>`:''}
      <div class="confirm-actions">
        <button class="btn-secondary" data-act="cancel">${escHtml(cancelLabel)}</button>
        <button class="${danger?'btn-danger':'btn-primary'}" data-act="ok">${escHtml(confirmLabel)}</button>
      </div>
    </div>`;
  document.getElementById('sheets').appendChild(wrap);
  requestAnimationFrame(()=> wrap.classList.add('open'));
  const close = ()=>{ wrap.classList.remove('open'); setTimeout(()=>wrap.remove(), 200); };
  wrap.addEventListener('click', e => {
    const act = e.target.dataset?.act;
    if (e.target === wrap || act === 'cancel') close();
    else if (act === 'ok') { haptic('medium'); close(); try { onConfirm && onConfirm(); } catch(err){ console.error(err); } }
  });
}
function setupSheetSwipe(el, onClose) {
  let startY=0, curY=0, dragging=false;
  // Accept swipe-down from anywhere in the top 72px (handle + title) of the sheet
  el.addEventListener('touchstart', e=>{
    const rect = el.getBoundingClientRect();
    const relY = e.touches[0].clientY - rect.top;
    const body = el.querySelector('.sheet-body');
    const bodyAtTop = !body || body.scrollTop === 0;
    if (relY <= 72 && bodyAtTop) {
      startY=e.touches[0].clientY; dragging=true;
    }
  },{passive:true});
  el.addEventListener('touchmove', e=>{
    if(!dragging) return;
    curY=e.touches[0].clientY;
    const dy=Math.max(0, curY-startY);
    el.style.transition='none';
    el.style.transform=`translateY(${dy}px)`;
  },{passive:true});
  el.addEventListener('touchend', ()=>{
    if(!dragging) return; dragging=false;
    const dy=curY-startY;
    if(dy>60){
      // Slide out from current position with ease-in (no spring)
      el.style.transition='transform 220ms ease-in';
      el.style.transform='translateY(100%)';
      setTimeout(()=>onClose(), 230);
    } else {
      // Snap back with spring
      el.style.transition='';
      el.style.transform='';
    }
  });
}
// Tactile feedback. NOTE: iOS Safari/PWA does NOT support navigator.vibrate, so this is a
// no-op on iPhone (our main target) and only fires on Android Chrome. Named presets keep
// call sites intention-revealing; pass a custom number/array for one-offs.
const HAPTIC = { light:8, medium:18, heavy:30, success:[12,40,18], warning:[20,40,20], error:[35,40,35] };
function haptic(kind='light') {
  try {
    if (!navigator.vibrate) return;
    navigator.vibrate(typeof kind === 'string' ? (HAPTIC[kind] ?? HAPTIC.light) : kind);
  } catch(e) {}
}
// Overlay an invisible native <input switch> on tappable controls so the finger physically
// toggles it → real iOS haptic tick. The click bubbles to the control, so its existing onclick
// still runs once (no double-fire, no JS forwarding). Idempotent via data-haptic.
const HAPTIC_TARGETS = '.nav-tab,.btn-primary,.btn-danger,.btn-secondary,.seg-btn,.range-btn,.type-seg-btn';
function enableHaptics(root) {
  if (!root || !root.querySelectorAll) return; // allow document (nodeType 9) as well as elements
  const list = (root.matches && root.matches(HAPTIC_TARGETS)) ? [root, ...root.querySelectorAll(HAPTIC_TARGETS)] : [...root.querySelectorAll(HAPTIC_TARGETS)];
  list.forEach(el => {
    if (el.dataset.haptic) return;
    // Never overlay a control whose native behavior a switch would hijack: <label>/<a>, or anything
    // wrapping its own interactive element (e.g. the CSV "Choose File" label around a file input).
    if (el.tagName === 'LABEL' || el.tagName === 'A' || el.querySelector('input,select,textarea,label,a')) return;
    el.dataset.haptic = '1';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    if (!el.style.overflow) el.style.overflow = 'hidden';
    const sw = document.createElement('input');
    sw.type = 'checkbox'; sw.setAttribute('switch',''); sw.className = 'haptic-overlay';
    sw.setAttribute('aria-hidden','true'); sw.tabIndex = -1;
    // Fire the control's real action EXPLICITLY (bubbling the click from the switch is unreliable on
    // iOS, which broke buttons), and stop the switch's own click bubbling so it can't double-trigger.
    sw.addEventListener('click', e => e.stopPropagation());
    sw.addEventListener('change', () => { haptic('light'); el.click(); });
    el.appendChild(sw);
  });
}
let _hapticObserver = null;
function initHaptics() {
  enableHaptics(document);
  if (_hapticObserver || typeof MutationObserver === 'undefined') return;
  _hapticObserver = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enableHaptics(n);
  });
  ['sheets','main'].forEach(id => { const el = document.getElementById(id); if (el) _hapticObserver.observe(el, {childList:true, subtree:true}); });
}
function showToast(msg, type='info', duration=3000) {
  haptic(type==='error'?'error':type==='warning'?'warning':type==='success'?'success':'light'); // feedback on most actions flows through here
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = msg;
  document.getElementById('toast-container').appendChild(div);
  setTimeout(()=>{
    div.classList.add('toast-out');
    setTimeout(()=>div.remove(), 260);
  }, duration);
}

// Currency picker (opens as sheet2)
function openCurrencyPicker(currentCode, onSelect) {
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Select Currency</div>
    <div class="sheet-body">
      <div class="cur-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Search currency…" id="cur-search-inp" autocomplete="off" inputmode="search" oninput="filterCurrencies(this.value,'${escHtml(currentCode)}')" style="font-size:16px">
      </div>
      <div id="cur-list">${renderCurrencyList(CURRENCIES, currentCode, onSelect)}</div>
    </div>`;
  openSheet2('currency', html);
  setTimeout(()=>document.getElementById('cur-search-inp')?.focus(), 350);
  window._curOnSelect = onSelect;
  window._curCode = currentCode;
}
function renderCurrencyList(list, current, onSelect) {
  return list.map(c => `
    <div class="cur-item${c.code===current?' selected':''}" onclick="selectCurrency('${c.code}')">
      <span class="cur-code">${c.code}</span>
      <span class="cur-name">${escHtml(c.name)}</span>
      <span class="cur-sym">${escHtml(c.symbol)}</span>
    </div>`).join('');
}
function filterCurrencies(q) {
  const filtered = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(q.toLowerCase()) ||
    c.name.toLowerCase().includes(q.toLowerCase())
  );
  document.getElementById('cur-list').innerHTML = renderCurrencyList(filtered, window._curCode, window._curOnSelect);
}
function selectCurrency(code) {
  if (window._curOnSelect) window._curOnSelect(code);
  closeTopSheet2();
}

// Quick action sheet (long press)
function openQuickAction(txId) {
  const tx = S.transactions.find(t=>t.id===txId); if(!tx) return;
  const html = `
    <div class="sheet-handle"></div>
    <div style="padding:12px 20px 4px;font-size:13px;color:var(--text-secondary)">${escHtml(tx.merchant)} · ${formatCurrency(tx.originalAmount, tx.originalCurrency)}</div>
    <div class="quick-item" onclick="openEditTxSheet('${txId}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </div>
    <div class="quick-item" onclick="duplicateTx('${txId}');closeTopSheet()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Duplicate
    </div>
    <div class="quick-item danger" onclick="deleteTx('${txId}');closeTopSheet()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      Delete
    </div>`;
  openSheet('quick-action', html);
}

// Day detail (calendar)
function openDayDetail(dateStr) {
  const dayTx = S.transactions.filter(t=>t.date===dateStr).sort((a,b)=>b.convertedAmount-a.convertedAmount);
  const label = formatDate(dateStr, {weekday:'long', month:'long', day:'numeric'});
  const rows = dayTx.length
    ? dayTx.map(t => txRowHTML(t)).join('')
    : `<div class="empty-state" style="padding:32px 0"><div style="font-size:32px;margin-bottom:8px">📅</div><div class="empty-state-title">No transactions</div></div>`;
  openSheet('day-detail', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${escHtml(label)}</div>
    <div class="sheet-body" style="padding:0">${rows}</div>`);
}
// Heatmap cell detail
function openHeatmapDetail(catId, monthStr) {
  const ci = getCatInfo(catId);
  const txs = S.transactions.filter(t=>t.type==='expense'&&t.category===catId&&t.date.startsWith(monthStr));
  const total = txs.reduce((s,t)=>s+t.convertedAmount,0);
  const label = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(new Date(monthStr+'-01T12:00:00'));
  const rows = txs.length
    ? txs.map(t=>txRowHTML(t)).join('')
    : `<div class="empty-state" style="padding:32px 0"><div class="empty-state-title">No transactions</div></div>`;
  openSheet('hm-detail', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${ci.emoji} ${escHtml(ci.name)} · ${escHtml(label)}</div>
    <div style="padding:4px 20px 12px;font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;color:var(--red)">${formatCurrency(total,S.settings.defaultCurrency)}</div>
    <div class="sheet-body" style="padding:0">${rows}</div>`);
}

// Transaction detail sheet
function openTxDetail(txId) {
  const tx = S.transactions.find(t=>t.id===txId); if (!tx) return;
  const ci = getCatInfo(tx.category);
  const acc   = S.accounts.find(a=>a.id===tx.accountId);
  const toAcc = tx.toAccountId ? S.accounts.find(a=>a.id===tx.toAccountId) : null;
  const dc = S.settings.defaultCurrency;
  const showConverted = tx.originalCurrency !== dc;
  const isTransfer = tx.type === 'transfer';
  const amtSign = isTransfer ? '' : tx.type==='expense' ? '-' : '+';
  openSheet('tx-detail', `
    <div class="sheet-handle"></div>
    <div class="sheet-body" style="padding-top:16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <div class="tx-cat-icon" style="background:${isTransfer?'var(--accent-bg)':ci.color+'22'};font-size:28px;width:56px;height:56px">${isTransfer?'⇄':ci.emoji}</div>
        <div>
          <div style="font-size:20px;font-weight:700">${escHtml(tx.merchant)}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">${isTransfer?escHtml((acc?.name||'?')+' → '+(toAcc?.name||'?')):escHtml(ci.name)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums" class="${isTransfer?'':tx.type==='expense'?'text-red':'text-green'}">
            ${amtSign}${formatCurrency(tx.originalAmount, tx.originalCurrency)}
          </div>
          ${showConverted?`<div style="font-size:12px;color:var(--text-tertiary);font-family:'JetBrains Mono',monospace">${amtSign}${formatCurrency(tx.convertedAmount,dc)}</div>`:''}
        </div>
      </div>
      <div class="full-divider" style="margin-bottom:16px"></div>
      ${detailRow('Date', formatDate(tx.date,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}
      ${isTransfer
        ? detailRow('From', acc?.name||'Unknown') + detailRow('To', toAcc?.name||'Unknown')
        : detailRow('Account', acc?.name||'Unknown')}
      ${detailRow('Type', tx.type.charAt(0).toUpperCase()+tx.type.slice(1))}
      ${showConverted?detailRow('Exchange Rate', tx.exchangeRate?.toFixed(4)||'—'):''}
      ${tx.note?detailRow('Note', tx.note):''}
      ${tx.tags&&tx.tags.length?`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px;color:var(--text-secondary);flex-shrink:0">Tags</span><div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-left:16px">${tx.tags.map(t=>`<button class="tag-chip" onclick="closeTopSheet();filterByTag('${escHtml(t)}')">#${escHtml(t)}</button>`).join('')}</div></div>`:''}
      ${tx.isRecurring?detailRow('Recurring','Yes — part of a recurring schedule'):''}
      <div style="height:16px"></div>
      <div style="display:flex;gap:10px">
        <button class="btn-secondary" style="flex:1" onclick="openEditTxSheet('${txId}')">Edit</button>
        <button class="btn-secondary" style="flex:1" onclick="duplicateTx('${txId}');closeTopSheet()">Duplicate</button>
      </div>
      <div style="height:10px"></div>
      <button class="btn-danger" onclick="deleteTx('${txId}');closeTopSheet()">Delete Transaction</button>
    </div>`);
}
function detailRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:13px;color:var(--text-secondary);flex-shrink:0">${escHtml(label)}</span>
    <span style="font-size:14px;font-weight:500;text-align:right;margin-left:16px;flex:1">${escHtml(value)}</span>
  </div>`;
}

