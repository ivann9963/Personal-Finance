// === CATEGORIES MANAGER ===
const CAT_COLORS = ['#FF6B6B','#FF9F43','#F7DC6F','#3FB950','#4ECDC4','#45B7D1','#58A6FF','#A29BFE','#C39BD3','#FD79A8','#E17055','#FDCB6E','#00CEC9','#74B9FF','#96CEB4','#6C5CE7','#FFEAA7','#B2BEC3'];
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
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
      <div onclick="openCategoryEditor('${escHtml(c.id)}')" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer">
        <div style="font-size:20px;width:32px;text-align:center;flex-shrink:0">${c.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600">${escHtml(c.name)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${inUse?`${txCount} transaction${txCount!==1?'s':''} · `:''}Tap to edit</div>
        </div>
        <div class="legend-dot" style="width:12px;height:12px;background:${c.color};flex-shrink:0"></div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        <button onclick="moveCat(${i},-1)" style="width:32px;height:32px;border-radius:8px;background:var(--bg-elevated);color:var(--text-secondary);font-size:15px;display:flex;align-items:center;justify-content:center${i===0?';opacity:.25':''}" ${i===0?'disabled':''}>↑</button>
        <button onclick="moveCat(${i},1)" style="width:32px;height:32px;border-radius:8px;background:var(--bg-elevated);color:var(--text-secondary);font-size:15px;display:flex;align-items:center;justify-content:center${i===cats.length-1?';opacity:.25':''}" ${i===cats.length-1?'disabled':''}>↓</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = rows + `<div style="padding:16px"><button class="btn-primary" onclick="openCategoryEditor()">+ Add Category</button></div>`;
}
function moveCat(index, dir) {
  const cats = S.categories;
  const ni = index + dir;
  if (ni < 0 || ni >= cats.length) return;
  [cats[index], cats[ni]] = [cats[ni], cats[index]];
  saveState(); renderCatList();
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
        <label class="form-label">Emoji (optional)</label>
        <input id="new-cat-emoji" class="form-input" type="text" placeholder="🏷️" value="${editing?escHtml(editing.emoji):''}" style="font-size:28px;text-align:center;height:60px">
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
      ${editing ? `<div style="height:10px"></div><button class="btn-danger" onclick="deleteCatFromEditor('${escHtml(editing.id)}')">${txCount?`Delete (${txCount} transactions will become Other)`:'Delete Category'}</button>` : ''}
    </div>`);
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
  if (inUse && !confirm(`Delete this category? ${inUse} transaction${inUse!==1?'s':''} will be moved to "Other".`)) return;
  // Reassign any transactions to 'other' so nothing is orphaned
  S.transactions.forEach(t => { if (t.category === id) t.category = 'other'; });
  // Clean up any budget for this category
  S.budgets = S.budgets.filter(b => b.category !== id);
  S.categories = S.categories.filter(c => c.id !== id);
  saveState(); closeTopSheet2(); renderCatList(); renderCurrentTab();
  showToast('Category deleted', 'success');
}
