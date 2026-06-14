// === CATEGORIES MANAGER ===
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
      <div style="font-size:20px;width:32px;text-align:center;flex-shrink:0">${c.emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600">${escHtml(c.name)}</div>
        ${inUse?`<div style="font-size:11px;color:var(--text-tertiary)">${txCount} transaction${txCount!==1?'s':''}</div>`:''}
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        <button onclick="moveCat(${i},-1)" style="width:32px;height:32px;border-radius:8px;background:var(--bg-elevated);color:var(--text-secondary);font-size:15px;display:flex;align-items:center;justify-content:center${i===0?';opacity:.25':''}" ${i===0?'disabled':''}>↑</button>
        <button onclick="moveCat(${i},1)" style="width:32px;height:32px;border-radius:8px;background:var(--bg-elevated);color:var(--text-secondary);font-size:15px;display:flex;align-items:center;justify-content:center${i===cats.length-1?';opacity:.25':''}" ${i===cats.length-1?'disabled':''}>↓</button>
        <button onclick="deleteCat('${escHtml(c.id)}')" title="${inUse?'Has transactions':'Delete'}" style="width:32px;height:32px;border-radius:8px;background:var(--red-bg);color:var(--red);font-size:13px;display:flex;align-items:center;justify-content:center${inUse?';opacity:.25':''}">✕</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = rows + `<div style="padding:16px"><button class="btn-primary" onclick="openAddCategorySheet()">+ Add Category</button></div>`;
}
function moveCat(index, dir) {
  const cats = S.categories;
  const ni = index + dir;
  if (ni < 0 || ni >= cats.length) return;
  [cats[index], cats[ni]] = [cats[ni], cats[index]];
  saveState(); renderCatList();
}
function deleteCat(id) {
  if (S.transactions.some(t => t.category === id)) {
    showToast('Category is in use — reassign transactions first', 'error'); return;
  }
  S.categories = S.categories.filter(c => c.id !== id);
  saveState(); renderCatList();
  showToast('Category deleted', 'success');
}
function openAddCategorySheet() {
  const COLORS = ['#FF6B6B','#FF9F43','#F7DC6F','#3FB950','#4ECDC4','#45B7D1','#58A6FF','#A29BFE','#C39BD3','#FD79A8','#E17055','#FDCB6E','#00CEC9','#74B9FF','#96CEB4','#6C5CE7','#FFEAA7','#B2BEC3'];
  window._newCatColor = COLORS[0];
  const dots = COLORS.map(col =>
    `<button onclick="pickNewCatColor('${col}')" data-color="${col}" class="cat-color-dot" style="width:30px;height:30px;border-radius:50%;background:${col};border:3px solid ${col===COLORS[0]?'#fff':'transparent'};transition:border-color 150ms;flex-shrink:0"></button>`
  ).join('');
  openSheet2('add-cat', `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Add Category</div>
    <div class="sheet-body">
      <div class="form-field">
        <label class="form-label">Emoji</label>
        <input id="new-cat-emoji" class="form-input" type="text" placeholder="🏷️" style="font-size:28px;text-align:center;height:60px">
      </div>
      <div class="form-field">
        <label class="form-label">Name</label>
        <input id="new-cat-name" class="form-input" type="text" placeholder="e.g. Hobbies">
      </div>
      <div class="form-field">
        <label class="form-label">Color</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;padding:4px 0">${dots}</div>
      </div>
      <div style="height:8px"></div>
      <button class="btn-primary" onclick="saveNewCategory()">Add Category</button>
    </div>`);
}
function pickNewCatColor(color) {
  window._newCatColor = color;
  document.querySelectorAll('.cat-color-dot').forEach(b => {
    b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent';
  });
}
function saveNewCategory() {
  const emoji = (document.getElementById('new-cat-emoji')?.value || '').trim();
  const name  = (document.getElementById('new-cat-name')?.value  || '').trim();
  if (!emoji) { showToast('Enter an emoji', 'error'); return; }
  if (!name)  { showToast('Enter a name',  'error'); return; }
  S.categories.push({ id:'cat_'+gid(), name, emoji, color: window._newCatColor||'#B2BEC3' });
  saveState(); closeTopSheet2(); renderCatList();
  showToast(`"${name}" added`, 'success');
}

