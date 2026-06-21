// === CATEGORIES MANAGER ===
const CAT_COLORS = ['#FF6B6B','#FF9F43','#F7DC6F','#3FB950','#4ECDC4','#45B7D1','#58A6FF','#A29BFE','#C39BD3','#FD79A8','#E17055','#FDCB6E','#00CEC9','#74B9FF','#96CEB4','#6C5CE7','#FFEAA7','#B2BEC3'];
const CAT_EMOJIS = ['🍔','🛒','🚗','🏠','💊','🎬','🛍️','💼','💰','✈️','📱','🎓','🐾','🏋️','🎁','🏥','🍺','⚡','☕','🍷','⛽','🏦','📈','🎮','🎵','📚','🧾','🔧','🌳','🐶','🍎','💅','🎨','💡'];
function openCategoriesManager() {
  openSheet('cat-manager', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Categories</div>
    <div class="sheet-body" style="padding:0" id="cat-manager-body"></div>`);
  renderCatList();
}
function renderCatList() {
  const body = document.getElementById('cat-manager-body'); if (!body) return;
  const cats = S.categories;
  const rows = cats.map((c, i) => {
    const txCount = S.transactions.filter(t => t.category === c.id).length;
    const inUse = txCount > 0;
    return `<div class="cat-row" data-id="${escHtml(c.id)}" data-idx="${i}">
      <div class="cat-drag-handle" title="Drag to reorder">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg>
      </div>
      <div onclick="openCategoryEditor('${escHtml(c.id)}')" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer">
        <div style="font-size:20px;width:28px;text-align:center;flex-shrink:0">${c.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600">${escHtml(c.name)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${inUse?`${txCount} transaction${txCount!==1?'s':''}`:'Tap to edit'}</div>
        </div>
        <div class="legend-dot" style="width:12px;height:12px;background:${c.color};flex-shrink:0"></div>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);padding:8px 16px 4px">Drag the ≡ handle to reorder · tap a row to edit</div>`
    + rows + `<div style="padding:16px"><button class="btn-primary" onclick="openCategoryEditor()">+ Add Category</button></div>`;
  setupCatReorder();
}
// Touch/mouse drag-to-reorder. While dragging, the lifted row follows the pointer and the
// other rows slide to open a gap (pure transforms, no array mutation until drop).
function setupCatReorder() {
  const body = document.getElementById('cat-manager-body'); if (!body) return;
  const rows = [...body.querySelectorAll('.cat-row')];
  if (rows.length < 2) return;
  const rowH = rows[0].offsetHeight || 56;
  rows.forEach(row => {
    const handle = row.querySelector('.cat-drag-handle'); if (!handle) return;
    let startY = 0, startIdx = 0, targetIdx = 0, dragging = false;
    const onMove = e => {
      if (!dragging) return;
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = y - startY;
      row.style.transform = `translateY(${dy}px)`;
      targetIdx = Math.max(0, Math.min(rows.length - 1, startIdx + Math.round(dy / rowH)));
      rows.forEach((r, i) => {
        if (r === row) return;
        let shift = 0;
        if (startIdx < targetIdx && i > startIdx && i <= targetIdx) shift = -rowH;
        else if (startIdx > targetIdx && i >= targetIdx && i < startIdx) shift = rowH;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      row.classList.remove('cat-dragging');
      rows.forEach(r => { r.style.transform = ''; });
      if (targetIdx !== startIdx) {
        const [moved] = S.categories.splice(startIdx, 1);
        S.categories.splice(targetIdx, 0, moved);
        saveState(); invalidateOtherTabs(); // order shows in analytics + tx form
      }
      renderCatList(); // rebuild with fresh indices/handlers
    };
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      dragging = true; startIdx = rows.indexOf(row); targetIdx = startIdx;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      row.classList.add('cat-dragging');
      haptic('medium'); // lift
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}
// Unified add / edit editor. `id` (optional) = edit existing; `onSaved(catId)` = callback after save.
function openCategoryEditor(id, onSaved) {
  const editing = id ? S.categories.find(c => c.id === id) : null;
  window._catEditId = editing ? editing.id : null;
  window._catSavedCb = typeof onSaved === 'function' ? onSaved : null;
  window._newCatColor = editing ? editing.color : CAT_COLORS[0];
  const txCount = editing ? S.transactions.filter(t => t.category === editing.id).length : 0;
  const dots = CAT_COLORS.map(col =>
    `<button onclick="pickNewCatColor('${col}')" data-color="${col}" class="cat-color-dot" style="width:30px;height:30px;border-radius:50%;background:${col};border:3px solid ${col===window._newCatColor?'#fff':'transparent'};transition:border-color 150ms;flex-shrink:0"></button>`
  ).join('');
  openSheet2('add-cat', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${editing ? 'Edit Category' : 'Add Category'}</div>
    <div class="sheet-body">
      <div class="form-field">
        <label class="form-label">Icon</label>
        <div class="cat-emoji-grid">${CAT_EMOJIS.map(e=>`<button type="button" class="cat-emoji-opt${editing&&editing.emoji===e?' sel':''}" data-emoji="${e}" onclick="pickCatEmoji('${e}')">${e}</button>`).join('')}</div>
        <input id="new-cat-emoji" class="form-input" type="text" placeholder="or type any emoji" value="${editing?escHtml(editing.emoji):''}" style="font-size:20px;text-align:center;height:48px;margin-top:8px">
      </div>
      <div class="form-field">
        <label class="form-label">Name</label>
        <input id="new-cat-name" class="form-input" type="text" placeholder="e.g. Hobbies" value="${editing?escHtml(editing.name):''}">
      </div>
      <div class="form-field">
        <label class="form-label">Color</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;padding:4px 0">${dots}</div>
      </div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveCategory()">${editing ? 'Save Changes' : 'Add Category'}</button>
      ${editing ? `<div style="height:10px"></div><button class="btn-danger" onclick="deleteCatFromEditor('${escHtml(editing.id)}')">Delete Category</button>` : ''}
    </div>`);
}
function pickCatEmoji(e) {
  const inp = document.getElementById('new-cat-emoji');
  if (inp) inp.value = e;
  document.querySelectorAll('.cat-emoji-opt').forEach(b => b.classList.toggle('sel', b.dataset.emoji === e));
}
function pickNewCatColor(color) {
  window._newCatColor = color;
  document.querySelectorAll('.cat-color-dot').forEach(b => {
    b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent';
  });
}
function saveCategory() {
  const emoji = (document.getElementById('new-cat-emoji')?.value || '').trim() || '🏷️';
  const name  = (document.getElementById('new-cat-name')?.value  || '').trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  const color = window._newCatColor || '#B2BEC3';
  let catId = window._catEditId;
  if (catId) {
    const idx = S.categories.findIndex(c => c.id === catId);
    if (idx >= 0) S.categories[idx] = { ...S.categories[idx], name, emoji, color };
  } else {
    catId = 'cat_' + gid();
    S.categories.push({ id: catId, name, emoji, color });
  }
  saveState(); closeTopSheet2();
  if (window._catSavedCb) { const cb = window._catSavedCb; window._catSavedCb = null; cb(catId); }
  else { renderCatList(); renderCurrentTab(); }
  showToast(`"${name}" ${window._catEditId ? 'saved' : 'added'}`, 'success');
  window._catEditId = null;
}
function deleteCatFromEditor(id) {
  const inUse = S.transactions.filter(t => t.category === id).length;
  if (!inUse) {
    confirmDialog({title:'Delete category?', confirmLabel:'Delete', danger:true}, ()=> finalizeDeleteCategory(id, 'other'));
    return;
  }
  // Category is in use — let the user choose where its transactions go (instead of always → Other).
  const sheet = document.getElementById('sheet2-add-cat');
  if (!sheet) { finalizeDeleteCategory(id, 'other'); return; }
  const opts = S.categories.filter(c => c.id !== id)
    .map(c=>`<option value="${c.id}"${c.id==='other'?' selected':''}>${c.emoji} ${escHtml(c.name)}</option>`).join('');
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Delete category</div>
    <div class="sheet-body">
      <div style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px">This category has <strong>${inUse}</strong> transaction${inUse!==1?'s':''}. Choose where to move ${inUse!==1?'them':'it'} before deleting.</div>
      <div class="form-field"><label class="form-label">Move transactions to</label>
        <select id="reassign-target" class="form-input">${opts}</select></div>
      <div style="height:8px"></div>
      <button class="btn-danger" onclick="finalizeDeleteCategory('${id}', document.getElementById('reassign-target').value)">Move &amp; Delete Category</button>
      <div style="height:10px"></div>
      <button class="btn-secondary" onclick="closeTopSheet2()">Cancel</button>
    </div>`;
}
function finalizeDeleteCategory(id, targetId) {
  S.transactions.forEach(t => { if (t.category === id) t.category = targetId; });
  S.budgets = S.budgets.filter(b => b.category !== id); // drop any budget on the removed category
  S.categories = S.categories.filter(c => c.id !== id);
  saveState(); closeTopSheet2(); renderCatList(); renderCurrentTab();
  showToast('Category deleted', 'success');
}
