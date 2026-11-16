/* VaporPet Tasks: task manager UI, work planner, storage, JSON import/export. */
(function () {
  'use strict';
  const VP = window.VaporPet;
  const STORE_KEY = 'vaporpet';
  const INSTANCE = Math.random().toString(36).slice(2);
  const LISTS = ['active', 'backlog', 'done'];
  const PRIORITIES = ['high', 'medium', 'low'];
  const PRIO_RANK = { high: 0, medium: 1, low: 2 };
  const PRIO_LABEL = { high: 'HIGH', medium: 'MED', low: 'LOW' };
  const HOUR_OPTIONS = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const isTab = new URLSearchParams(location.search).has('tab') || !hasChrome;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- date helpers ---------- */
  function localDateStr(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseLocalDate(str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(base, offset) {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  }
  function getHorizonDays() {
    const now = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i);
      const iso = localDateStr(d);
      const wd = d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
      const md = d.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
      const wdNice = d.toLocaleDateString([], { weekday: 'short' });
      const mdNice = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      days.push({
        iso,
        offset: i,
        pill: i === 0 ? 'TODAY' : i === 1 ? 'TOM' : wd,
        heading: i === 0 ? `TODAY · ${wd} ${md}` : i === 1 ? `TOMORROW · ${wd} ${md}` : `${wd} · ${md}`,
        opt: i === 0 ? `Today (${wdNice})` : i === 1 ? `Tomorrow (${wdNice})` : `${wdNice}, ${mdNice}`
      });
    }
    return days;
  }
  function formatDayShort(iso) {
    if (!iso) return '';
    const today = localDateStr();
    const tom = localDateStr(addDays(new Date(), 1));
    if (iso === today) return 'Today';
    if (iso === tom) return 'Tomorrow';
    const d = parseLocalDate(iso);
    return d ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : iso;
  }
  function formatHours(h) {
    const n = Number(h) || 0;
    return n % 1 === 0 ? `${n}h` : `${n.toFixed(2).replace(/0$/, '')}h`;
  }

  /* ---------- storage ---------- */
  const store = {
    async get() {
      if (hasChrome) return (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
      try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
    },
    async set(v) {
      if (hasChrome) await chrome.storage.local.set({ [STORE_KEY]: v });
      else try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
  };

  function defaultState() {
    const now = Date.now();
    const t = (title, list, extra) => Object.assign({
      id: uid(), title, list, notes: '', day: '', hours: 0, priority: 'medium', createdAt: now, completedAt: null
    }, extra || {});
    return {
      schema: 1,
      tasks: [
        t('Finish a task to feed your egg', 'active', { day: localDateStr(), hours: 1, priority: 'high' })
      ],
      pet: VP.newPet(),
      ui: { mode: 'list', tab: 'active', addPos: 'bottom', addList: 'active', planDay: 'all' }
    };
  }

  let state = null;
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      state.savedBy = INSTANCE;
      state.savedAt = Date.now();
      await store.set(state);
      updateBadge();
    }, 120);
  }
  function updateBadge() {
    try {
      if (!hasChrome || !chrome.action) return;
      const n = state.tasks.filter(t => t.list === 'active').length;
      chrome.action.setBadgeText({ text: n ? String(n) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff71ce' });
    } catch (e) { /* ignore */ }
  }

  function sanitizeState(s) {
    if (!s || typeof s !== 'object') return defaultState();
    s.tasks = Array.isArray(s.tasks) ? s.tasks.filter(t => t && t.title) : [];
    s.tasks.forEach(t => {
      if (!LISTS.includes(t.list)) t.list = 'active';
      if (!t.id) t.id = uid();
      t.day = typeof t.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.day) ? t.day : '';
      t.hours = Math.max(0, Math.min(24, parseFloat(t.hours) || 0));
      t.priority = PRIORITIES.includes(t.priority) ? t.priority : 'medium';
    });
    s.pet = VP.ensureDna(s.pet && typeof s.pet === 'object' ? s.pet : VP.newPet());
    s.pet.exp = Math.max(0, parseInt(s.pet.exp, 10) || 0);
    s.ui = Object.assign({ mode: 'list', tab: 'active', addPos: 'bottom', addList: 'active', planDay: 'all' }, s.ui || {});
    return s;
  }

  /* ---------- undo ---------- */
  let undoSnap = null;
  let toastTimer = null;
  function snapshot() { return JSON.stringify({ tasks: state.tasks, pet: state.pet }); }
  function toast(msg, snap) {
    undoSnap = snap || null;
    $('#toastMsg').textContent = msg;
    $('#toastUndo').hidden = !snap;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; undoSnap = null; }, snap ? 6000 : 2500);
  }
  $('#toastUndo').addEventListener('click', () => {
    if (!undoSnap) return;
    const s = JSON.parse(undoSnap);
    state.tasks = s.tasks;
    state.pet = s.pet;
    undoSnap = null;
    $('#toast').hidden = true;
    $('#levelFx').hidden = true;
    save();
    renderAll();
  });

  /* ---------- task ops ---------- */
  const byList = list => {
    const arr = state.tasks.filter(t => t.list === list);
    if (list === 'done') arr.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    return arr;
  };
  const findTask = id => state.tasks.find(t => t.id === id);
  function removeTask(id) { const i = state.tasks.findIndex(t => t.id === id); return i >= 0 ? state.tasks.splice(i, 1)[0] : null; }
  function moveToTop(id) {
    const t = removeTask(id); if (!t) return;
    const firstIdx = state.tasks.findIndex(x => x.list === t.list);
    state.tasks.splice(firstIdx < 0 ? state.tasks.length : firstIdx, 0, t);
  }
  function moveToBottom(id) { const t = removeTask(id); if (t) state.tasks.push(t); }
  function moveRelative(id, targetId, after) {
    if (id === targetId) return;
    const t = removeTask(id); if (!t) return;
    let i = state.tasks.findIndex(x => x.id === targetId);
    if (i < 0) { state.tasks.push(t); return; }
    state.tasks.splice(after ? i + 1 : i, 0, t);
  }
  function setList(id, list, pos) {
    const t = findTask(id); if (!t) return;
    t.list = list;
    if (list !== 'done') t.completedAt = null;
    if (pos === 'top') moveToTop(id); else moveToBottom(id);
  }

  const freshIds = new Set();
  function addTask(title, list, pos, extra) {
    title = title.trim();
    if (!title) return null;
    const t = Object.assign({
      id: uid(), title, list, notes: '', day: '', hours: 0, priority: 'medium', createdAt: Date.now(), completedAt: null
    }, extra || {});
    state.tasks.push(t);
    freshIds.add(t.id);
    if (pos === 'top') moveToTop(t.id);
    save();
    renderAll();
    return t;
  }

  function completeTask(id) {
    const t = findTask(id);
    if (!t || t.list === 'done') return;
    const snap = snapshot();
    t.list = 'done';
    t.completedAt = Date.now();
    let msg = `✓ "${t.title.slice(0, 28)}${t.title.length > 28 ? '…' : ''}"`;
    let lvl = null;
    if (!t.expAwarded) {
      t.expAwarded = true;
      state.pet.exp += 1;
      state.pet.lastDone = Date.now();
      msg += ' +1 EXP';
      if (state.pet.exp % VP.EXP_PER_LEVEL === 0) lvl = VP.levelUp(state.pet);
    }
    save();
    renderAll();
    if (lvl) showLevelUp(lvl);
    toast(msg, snap);
  }

  function deleteTask(id) {
    const t = findTask(id); if (!t) return;
    const snap = snapshot();
    removeTask(id);
    save();
    renderAll();
    toast('Task deleted', snap);
  }

  /* ---------- pet panel ---------- */
  let lastPetKey = '';
  function renderPet(force) {
    const p = state.pet;
    const mood = VP.moodOf(p);
    const key = JSON.stringify([p.dna, p.exp, mood.key]);
    if (force || key !== lastPetKey) {
      $('#petSvg').innerHTML = VP.render(p, { mood });
      lastPetKey = key;
    }
    const lv = VP.levelOf(p.exp), st = VP.stageOf(p.exp);
    const into = p.exp % VP.EXP_PER_LEVEL;
    $('#petName').textContent = p.name;
    $('#petMood').textContent = mood.label;
    $('#petMood').className = 'mood ' + mood.key;
    $('#petStage').textContent = VP.STAGES[st - 1].name;
    $('#petLv').textContent = lv;
    $('#petStageNo').textContent = st;
    $('#expFill').style.width = (into / VP.EXP_PER_LEVEL * 100) + '%';
    const left = VP.EXP_PER_LEVEL - into;
    $('#expText').innerHTML = `<b>${left} task${left > 1 ? 's' : ''}</b> until ${st === 1 ? 'it hatches' : lv < 12 ? 'it evolves' : 'it mutates'}`;
  }

  function showLevelUp(lvl) {
    const fx = $('#levelFx');
    const changes = lvl.changes.slice(0, 3).map(c => `<div class="chg">${esc(c)}</div>`).join('');
    const title = lvl.lv === 2 ? 'HATCHED!' : lvl.evolved ? 'EVOLVED!' : 'MUTATED!';
    fx.innerHTML = `<div class="big">${title}</div><div class="fxpet">${VP.render(state.pet, { mood: { key: 'hyped' } })}</div><div class="sub">LV ${lvl.lv} · ${esc(lvl.stageName)}</div>${changes}<div class="tapclose">tap to continue</div>`;
    fx.hidden = false;
    fx.style.animation = 'none'; void fx.offsetWidth; fx.style.animation = '';
    const [x, y] = centerOf(fx);
    setTimeout(() => { burst(x, y - 40, 24); burst(x, y - 40, 16); }, 250);
    clearTimeout(showLevelUp.t);
    showLevelUp.t = setTimeout(() => { fx.hidden = true; }, 5000);
  }

  /* ---------- list view ---------- */
  function renderCounts() {
    $('#cntActive').textContent = byList('active').length;
    $('#cntBacklog').textContent = byList('backlog').length;
    $('#cntDone').textContent = byList('done').length;
  }

  const svg = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    top: svg('<path d="M5 4h14M12 20V9M7 13l5-5 5 5"/>'),
    bottom: svg('<path d="M5 20h14M12 4v11M7 11l5 5 5-5"/>'),
    backlog: svg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'),
    active: svg('<path d="M12 20V6M6 12l6-6 6 6"/><path d="M5 3h14"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>'),
    del: svg('<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13"/>')
  };
  const btn = (act, label, icon) => `<button data-act="${act}" data-tip="${label}" aria-label="${label}">${icon}</button>`;

  function taskHTML(t, i) {
    const done = t.list === 'done';
    const when = done && t.completedAt ? new Date(t.completedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const tip = done ? 'Undo: move back to Active' : 'Complete · +1 EXP';
    const meta = [];
    if (when) meta.push(`<span>Done ${esc(when)}</span>`);
    if (!done && t.priority && t.priority !== 'medium') meta.push(`<span class="tbadge prio-${t.priority}">${PRIO_LABEL[t.priority]}</span>`);
    if (!done && t.day) meta.push(`<span class="tbadge">${esc(formatDayShort(t.day))}</span>`);
    if (!done && t.hours > 0) meta.push(`<span class="tbadge">${formatHours(t.hours)}</span>`);
    return `<li class="task${done ? ' done' : ''}${i === 0 && t.list === 'active' ? ' first' : ''}${freshIds.has(t.id) ? ' new' : ''}" data-id="${esc(t.id)}" ${done ? '' : 'draggable="true"'}>
      ${done ? '' : '<span class="grip" data-tip="Drag to reorder">⋮⋮</span>'}
      <button class="check" data-act="${done ? 'restore' : 'complete'}" data-tip="${tip}" aria-label="${tip}">${ICON.check}</button>
      <div class="tbody">
        <div class="ttitle">${esc(t.title)}</div>
        ${meta.length ? `<div class="tmeta">${meta.join('')}</div>` : ''}
      </div>
      <div class="tact">
        ${done ? '' : btn('top', 'Move to top', ICON.top) + btn('bottom', 'Move to bottom', ICON.bottom) +
          (t.list === 'active' ? btn('swap', 'Send to Backlog', ICON.backlog) : btn('swap', 'Move to Active', ICON.active)) +
          btn('edit', 'Rename', ICON.edit)}
        ${btn('del', 'Delete', ICON.del)}
      </div>
    </li>`;
  }

  /* ---------- tooltip ---------- */
  const tipEl = document.createElement('div');
  tipEl.id = 'tip';
  document.body.appendChild(tipEl);
  let tipFor = null;
  document.addEventListener('mouseover', ev => {
    const el = ev.target.closest('[data-tip]');
    if (el === tipFor) return;
    tipFor = el;
    if (!el) { tipEl.classList.remove('show'); return; }
    tipEl.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = Math.min(Math.max(6, r.left + r.width / 2 - w / 2), window.innerWidth - w - 6);
    let y = r.top - h - 7;
    if (y < 4) y = r.bottom + 7;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
    tipEl.classList.add('show');
  });
  document.addEventListener('mousedown', () => { tipEl.classList.remove('show'); tipFor = null; });

  /* ---------- juice ---------- */
  const COLORS = ['#ff71ce', '#01cdfe', '#05ffa1', '#fffb96', '#b967ff'];
  function burst(x, y, n) {
    for (let i = 0; i < (n || 12); i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 34;
      s.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i % COLORS.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }
  function floatText(x, y, text) {
    const el = document.createElement('div');
    el.className = 'floatxp';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
  function centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  // Animate first, then commit. Guards against double clicks.
  const completing = new Set();
  function celebrateComplete(id, fromEl, rowEl) {
    if (completing.has(id)) return;
    completing.add(id);
    tipEl.classList.remove('show');
    const [x, y] = centerOf(fromEl);
    burst(x, y, 14);
    floatText(x, y - 10, '+1 EXP');
    if (rowEl) rowEl.classList.add('completing');
    setTimeout(() => {
      completing.delete(id);
      completeTask(id);
      const pet = $('#petSvg');
      pet.classList.remove('cheer'); void pet.offsetWidth; pet.classList.add('cheer');
      const bar = $('.expbar');
      bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop');
    }, rowEl ? 600 : 380);
  }

  function renderTasks() {
    const tab = state.ui.tab;
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    renderCounts();
    const items = byList(tab);
    const ul = $('#taskList');
    if (!items.length) {
      const msg = {
        active: '<big>✦</big>Nothing active.<br>Add a task above or pull one from the backlog.',
        backlog: '<big>☁</big>Backlog is empty.',
        done: '<big>◌</big>No finished tasks yet.<br>Your pet is hungry.'
      }[tab];
      ul.innerHTML = `<li class="empty">${msg}</li>`;
    } else {
      ul.innerHTML = items.map(taskHTML).join('');
    }
    freshIds.clear();
    const foot = $('#listFoot');
    foot.innerHTML = tab === 'done' && items.length ? '<button class="btn danger" id="clearDone">CLEAR DONE</button>' : '';
  }

  function startEdit(li) {
    const t = findTask(li.dataset.id); if (!t) return;
    const body = li.querySelector('.tbody');
    if (body.querySelector('.edit')) return;
    li.draggable = false;
    li.classList.add('editing');
    body.innerHTML = `<div class="edit">
      <input class="e-title" maxlength="300" value="${esc(t.title)}">
      <div class="row"><button class="btn" data-act="e-cancel">CANCEL</button><button class="btn primary" data-act="e-save">SAVE</button></div>
    </div>`;
    const inp = body.querySelector('.e-title');
    inp.focus();
    inp.select();
    body.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); renderTasks(); }
      if (ev.key === 'Enter' && (ev.target === inp || ev.ctrlKey)) { ev.preventDefault(); commitEdit(li); }
    });
  }
  function commitEdit(li) {
    const t = findTask(li.dataset.id); if (!t) return;
    const title = li.querySelector('.e-title').value.trim();
    if (title) t.title = title;
    save();
    renderAll();
  }

  $('#taskList').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-act]');
    const li = ev.target.closest('.task');
    if (!btn || !li) return;
    const id = li.dataset.id;
    switch (btn.dataset.act) {
      case 'complete': celebrateComplete(id, btn, li); break;
      case 'restore': setList(id, 'active', 'bottom'); freshIds.add(id); save(); renderAll(); toast('Moved back to Active'); break;
      case 'top': moveToTop(id); freshIds.add(id); save(); renderAll(); break;
      case 'bottom': moveToBottom(id); freshIds.add(id); save(); renderAll(); break;
      case 'swap': {
        const t = findTask(id);
        const to = t.list === 'active' ? 'backlog' : 'active';
        setList(id, to, 'bottom'); save(); renderAll();
        toast(`Sent to ${to === 'active' ? 'Active' : 'Backlog'}`);
        break;
      }
      case 'edit': startEdit(li); break;
      case 'del': deleteTask(id); break;
      case 'e-save': commitEdit(li); break;
      case 'e-cancel': renderTasks(); break;
    }
  });
  $('#taskList').addEventListener('dblclick', ev => {
    const li = ev.target.closest('.task');
    if (li && ev.target.closest('.tbody') && !ev.target.closest('.edit')) startEdit(li);
  });

  // drag & drop reordering
  let dragId = null;
  $('#taskList').addEventListener('dragstart', ev => {
    const li = ev.target.closest('.task');
    if (!li) return;
    dragId = li.dataset.id;
    li.classList.add('dragging');
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', dragId); } catch (e) { /* ignore */ }
  });
  $('#taskList').addEventListener('dragover', ev => {
    const li = ev.target.closest('.task');
    if (!dragId || !li || li.dataset.id === dragId) return;
    ev.preventDefault();
    const r = li.getBoundingClientRect();
    const after = ev.clientY > r.top + r.height / 2;
    $$('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  $('#taskList').addEventListener('drop', ev => {
    const li = ev.target.closest('.task');
    if (!dragId || !li) return;
    ev.preventDefault();
    const after = li.classList.contains('drop-after');
    moveRelative(dragId, li.dataset.id, after);
    dragId = null;
    save();
    renderAll();
  });
  $('#taskList').addEventListener('dragend', () => {
    dragId = null;
    $$('.dragging,.drop-before,.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  $('#listFoot').addEventListener('click', ev => {
    if (ev.target.id !== 'clearDone') return;
    const snap = snapshot();
    state.tasks = state.tasks.filter(t => t.list !== 'done');
    save(); renderAll();
    toast('Cleared finished tasks (EXP kept)', snap);
  });

  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    state.ui.tab = b.dataset.tab; save(); renderTasks();
  }));

  // add form
  function renderAddControls() {
    const pos = state.ui.addPos, list = state.ui.addList;
    $('#addPos').textContent = pos === 'top' ? '⤒' : '⤓';
    $('#addPos').dataset.tip = `Adds to the ${pos} · click to switch`;
    $('#addWhere').textContent = list === 'active' ? 'ACTIVE' : 'BACKLOG';
    $('#addWhere').dataset.tip = `Adds to ${list === 'active' ? 'Active' : 'Backlog'} · click to switch`;
    $('#addInput').placeholder = 'What needs doing?';
  }
  $('#addPos').addEventListener('click', () => {
    state.ui.addPos = state.ui.addPos === 'top' ? 'bottom' : 'top'; save(); renderAddControls();
  });
  $('#addWhere').addEventListener('click', () => {
    state.ui.addList = state.ui.addList === 'active' ? 'backlog' : 'active'; save(); renderAddControls();
  });
  $('#addForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const inp = $('#addInput');
    const list = state.ui.addList;
    if (inp.value.trim()) { const [x, y] = centerOf($('#addForm .plus')); burst(x, y, 8); }
    addTask(inp.value, list, state.ui.addPos);
    if (inp.value.trim() && state.ui.tab !== list) { state.ui.tab = list; renderTasks(); }
    inp.value = '';
    inp.focus();
  });

  /* ---------- planner view ---------- */
  function sortForPlanner(list) {
    const order = new Map(state.tasks.map((t, idx) => [t.id, idx]));
    return list.slice().sort((a, b) => {
      const pa = PRIO_RANK[a.priority] ?? 1;
      const pb = PRIO_RANK[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }

  function dayOptionsHTML(selectedDay, horizon) {
    const known = new Set(horizon.map(d => d.iso));
    let opts = `<option value=""${selectedDay === '' ? ' selected' : ''}>Unscheduled</option>`;
    if (selectedDay && !known.has(selectedDay)) {
      opts += `<option value="${esc(selectedDay)}" selected>${esc(formatDayShort(selectedDay))}</option>`;
    }
    for (const d of horizon) {
      opts += `<option value="${d.iso}"${selectedDay === d.iso ? ' selected' : ''}>${esc(d.opt)}</option>`;
    }
    return opts;
  }

  function hoursOptionsHTML(selectedHours) {
    const val = Number(selectedHours) || 0;
    const list = HOUR_OPTIONS.includes(val) ? HOUR_OPTIONS : [...HOUR_OPTIONS, val].sort((a, b) => a - b);
    return list.map(h => {
      const label = h === 0 ? '0h · est' : formatHours(h);
      return `<option value="${h}"${val === h ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  function prioOptionsHTML(selectedPrio) {
    return PRIORITIES.map(p => `<option value="${p}"${selectedPrio === p ? ' selected' : ''}>${PRIO_LABEL[p]}</option>`).join('');
  }

  function plannerTaskHTML(t, horizon, isOverdue) {
    const prio = t.priority || 'medium';
    const isBacklog = t.list === 'backlog';
    return `<div class="p-task prio-${prio}${isBacklog ? ' from-backlog' : ''}" data-id="${esc(t.id)}">
      <div class="p-top">
        <button class="check" data-pact="complete" data-tip="Complete · +1 EXP" aria-label="Complete">${ICON.check}</button>
        <div class="p-title" data-tip="Double-click to rename">${esc(t.title)}</div>
        <div class="p-acts">
          ${isOverdue ? `<button class="p-icon-btn" data-pact="move-today" data-tip="Move to Today">⇥</button>` : ''}
          <button class="p-icon-btn" data-pact="focus" data-tip="Start in Focus mode">▶</button>
          ${t.day ? `<button class="p-icon-btn" data-pact="unschedule" data-tip="Clear day">✕</button>` : ''}
        </div>
      </div>
      <div class="p-controls">
        <select class="p-sel prio-${prio}" data-pfield="priority" data-tip="Priority" aria-label="Priority">${prioOptionsHTML(prio)}</select>
        <select class="p-sel" data-pfield="day" data-tip="Assigned day" aria-label="Assigned day">${dayOptionsHTML(t.day, horizon)}</select>
        <select class="p-sel" data-pfield="hours" data-tip="Estimated hours" aria-label="Hours">${hoursOptionsHTML(t.hours)}</select>
      </div>
    </div>`;
  }

  function renderPlanner() {
    const inner = $('#plannerInner');
    if (!inner) return;
    const horizon = getHorizonDays();
    const todayStr = horizon[0].iso;
    const horizonSet = new Set(horizon.map(d => d.iso));

    // Include active tasks, plus any backlog tasks that have a day assigned
    const workTasks = state.tasks.filter(t => t.list === 'active' || (t.list === 'backlog' && t.day));
    const overdueTasks = sortForPlanner(workTasks.filter(t => t.day && t.day < todayStr));
    const futureTasks = sortForPlanner(workTasks.filter(t => t.day && t.day > horizon[horizon.length - 1].iso));
    const unplannedTasks = sortForPlanner(state.tasks.filter(t => t.list === 'active' && !t.day));

    const validFilters = new Set(['all', 'unplanned', ...(overdueTasks.length ? ['overdue'] : []), ...horizon.map(d => d.iso)]);
    const filter = validFilters.has(state.ui.planDay) ? state.ui.planDay : 'all';
    const defaultAddDay = horizonSet.has(filter) ? filter : (filter === 'unplanned' ? '' : todayStr);

    // Filter pills
    const pills = [
      `<button type="button" class="plan-pill${filter === 'all' ? ' on' : ''}" data-pact="filter" data-day="all">ALL <b>${workTasks.length}</b></button>`,
      overdueTasks.length ? `<button type="button" class="plan-pill overdue${filter === 'overdue' ? ' on' : ''}" data-pact="filter" data-day="overdue">OVERDUE <b>${overdueTasks.length}</b></button>` : '',
      ...horizon.map(d => {
        const cnt = workTasks.filter(t => t.day === d.iso).length;
        return `<button type="button" class="plan-pill${filter === d.iso ? ' on' : ''}" data-pact="filter" data-day="${d.iso}">${d.pill}${cnt ? ` <b>${cnt}</b>` : ''}</button>`;
      }),
      `<button type="button" class="plan-pill${filter === 'unplanned' ? ' on' : ''}" data-pact="filter" data-day="unplanned">UNPLANNED <b>${unplannedTasks.length}</b></button>`
    ].join('');

    // Build day sections
    const sections = [];

    if (overdueTasks.length && (filter === 'all' || filter === 'overdue')) {
      const hrs = overdueTasks.reduce((s, t) => s + (t.hours || 0), 0);
      sections.push(`<section class="plan-day is-overdue">
        <div class="plan-day-head">
          <span class="plan-day-title">OVERDUE / CARRYOVER</span>
          <span class="plan-cap over">${formatHours(hrs)} · ${overdueTasks.length}</span>
        </div>
        <div class="plan-day-tasks">${overdueTasks.map(t => plannerTaskHTML(t, horizon, true)).join('')}</div>
      </section>`);
    }

    for (const d of horizon) {
      if (filter !== 'all' && filter !== d.iso) continue;
      const dayTasks = sortForPlanner(workTasks.filter(t => t.day === d.iso));
      // In 'all' mode, always show Today and Tomorrow; show later days if they have tasks
      if (filter === 'all' && d.offset > 1 && !dayTasks.length) continue;
      const hrs = dayTasks.reduce((s, t) => s + (t.hours || 0), 0);
      const pct = Math.min(100, (hrs / 8) * 100);
      const over = hrs > 8;
      sections.push(`<section class="plan-day${d.offset === 0 ? ' is-today' : ''}">
        <div class="plan-day-head">
          <span class="plan-day-title">${d.heading}</span>
          <span class="plan-cap${over ? ' over' : ''}" data-tip="${over ? 'Over 8h daily target!' : 'Scheduled hours / 8h day'}">
            <span>${formatHours(hrs)} / 8h</span>
            <span class="plan-cap-bar"><i style="width:${pct}%"></i></span>
          </span>
        </div>
        <div class="plan-day-tasks">
          ${dayTasks.length ? dayTasks.map(t => plannerTaskHTML(t, horizon, false)).join('') : '<div class="plan-slot-empty">No blocks assigned — add above or assign a task below.</div>'}
        </div>
      </section>`);
    }

    if (futureTasks.length && filter === 'all') {
      const hrs = futureTasks.reduce((s, t) => s + (t.hours || 0), 0);
      sections.push(`<section class="plan-day">
        <div class="plan-day-head">
          <span class="plan-day-title">LATER DATES</span>
          <span class="plan-cap">${formatHours(hrs)} · ${futureTasks.length}</span>
        </div>
        <div class="plan-day-tasks">${futureTasks.map(t => plannerTaskHTML(t, horizon, false)).join('')}</div>
      </section>`);
    }

    if (filter === 'all' || filter === 'unplanned') {
      const hrs = unplannedTasks.reduce((s, t) => s + (t.hours || 0), 0);
      sections.push(`<section class="plan-day is-unplanned">
        <div class="plan-day-head">
          <span class="plan-day-title">UNSCHEDULED ACTIVE</span>
          <span class="plan-cap">${hrs > 0 ? formatHours(hrs) + ' · ' : ''}${unplannedTasks.length}</span>
        </div>
        <div class="plan-day-tasks">
          ${unplannedTasks.length ? unplannedTasks.map(t => plannerTaskHTML(t, horizon, false)).join('') : '<div class="plan-slot-empty">All active tasks are scheduled!</div>'}
        </div>
      </section>`);
    }

    const prevTitle = $('#planAddInput') ? $('#planAddInput').value : '';
    const prevHours = $('#planAddHours') ? Number($('#planAddHours').value) : 1;
    const prevPrio = $('#planAddPrio') ? $('#planAddPrio').value : 'medium';

    inner.innerHTML = `
      <form class="plan-add" id="planAddForm" autocomplete="off">
        <div class="plan-add-top">
          <input id="planAddInput" placeholder="Block out a task…" maxlength="300" value="${esc(prevTitle)}">
          <button type="submit" class="plus" data-tip="Add to planner" aria-label="Add to planner">+</button>
        </div>
        <div class="plan-add-meta">
          <select class="p-sel" id="planAddDay" aria-label="Day">${dayOptionsHTML(defaultAddDay, horizon)}</select>
          <select class="p-sel" id="planAddHours" aria-label="Hours">${hoursOptionsHTML(prevHours)}</select>
          <select class="p-sel prio-${prevPrio}" id="planAddPrio" aria-label="Priority">${prioOptionsHTML(prevPrio)}</select>
        </div>
      </form>
      <div class="plan-strip">${pills}</div>
      ${sections.join('')}`;
  }

  $('#plannerInner').addEventListener('submit', ev => {
    if (ev.target.id !== 'planAddForm') return;
    ev.preventDefault();
    const inp = $('#planAddInput');
    const title = inp.value.trim();
    if (!title) return;
    const day = $('#planAddDay').value;
    const hours = parseFloat($('#planAddHours').value) || 0;
    const priority = $('#planAddPrio').value || 'medium';
    const [x, y] = centerOf(ev.target.querySelector('.plus'));
    burst(x, y, 8);
    inp.value = '';
    addTask(title, 'active', 'bottom', { day, hours, priority });
    const nextInp = $('#planAddInput');
    if (nextInp) nextInp.focus();
  });

  $('#plannerInner').addEventListener('change', ev => {
    const sel = ev.target.closest('select');
    if (!sel) return;
    if (sel.id === 'planAddPrio') {
      sel.className = `p-sel prio-${sel.value}`;
      return;
    }
    const card = sel.closest('.p-task');
    const field = sel.dataset.pfield;
    if (!card || !field) return;
    const t = findTask(card.dataset.id);
    if (!t) return;
    if (field === 'priority') t.priority = PRIORITIES.includes(sel.value) ? sel.value : 'medium';
    if (field === 'day') {
      t.day = sel.value;
      if (t.day && t.list === 'backlog') t.list = 'active';
    }
    if (field === 'hours') t.hours = Math.max(0, Math.min(24, parseFloat(sel.value) || 0));
    save();
    renderAll();
  });

  $('#plannerInner').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-pact]');
    if (!btn) return;
    const act = btn.dataset.pact;
    if (act === 'filter') {
      state.ui.planDay = btn.dataset.day;
      save();
      renderPlanner();
      return;
    }
    const card = btn.closest('.p-task');
    if (!card) return;
    const id = card.dataset.id;
    const t = findTask(id);
    if (!t) return;
    if (act === 'complete') {
      celebrateComplete(id, btn, card);
    } else if (act === 'unschedule') {
      t.day = '';
      save();
      renderAll();
      toast('Removed from schedule');
    } else if (act === 'move-today') {
      t.day = localDateStr();
      if (t.list === 'backlog') t.list = 'active';
      save();
      renderAll();
      toast('Moved to Today');
    } else if (act === 'focus') {
      if (t.list !== 'active') setList(id, 'active', 'top');
      else moveToTop(id);
      save();
      setMode('focus');
    }
  });

  $('#plannerInner').addEventListener('dblclick', ev => {
    const titleEl = ev.target.closest('.p-title');
    const card = ev.target.closest('.p-task');
    if (!titleEl || !card || titleEl.querySelector('input')) return;
    const t = findTask(card.dataset.id);
    if (!t) return;
    titleEl.innerHTML = `<div class="edit"><input class="e-title" maxlength="300" value="${esc(t.title)}"></div>`;
    const inp = titleEl.querySelector('.e-title');
    inp.focus();
    inp.select();
    const finish = ok => {
      if (ok && inp.value.trim()) t.title = inp.value.trim();
      save();
      renderAll();
    };
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    });
  });

  /* ---------- focus view ---------- */
  function renderFocus() {
    const t = byList('active')[0];
    $('#focusInner').innerHTML = `
      <div class="flabel">${t ? 'NOW' : 'ALL CLEAR'}</div>
      <div class="fcard"><div class="ftitle">${t ? esc(t.title) : 'No active tasks ✦'}</div></div>
      ${t ? '<button class="fdone" data-f="done">✓ COMPLETE</button>' : ''}
      <button class="fexit" data-f="list">← Exit focus</button>`;
  }
  $('#focusInner').addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    const top = byList('active')[0];
    if (b.dataset.f === 'done' && top) {
      const card = $('.fcard');
      if (card) card.classList.add('zap');
      celebrateComplete(top.id, b, null);
    }
    if (b.dataset.f === 'list') setMode('list');
  });

  /* ---------- modes ---------- */
  function setMode(mode) {
    state.ui.mode = mode;
    document.body.classList.toggle('mode-list', mode === 'list');
    document.body.classList.toggle('mode-focus', mode === 'focus');
    document.body.classList.toggle('mode-planner', mode === 'planner');
    $$('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    save();
    renderAll();
  }
  $$('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  function renderAll() {
    renderPet();
    renderTasks();
    renderFocus();
    renderPlanner();
    renderAddControls();
  }

  /* ---------- sheets (overlay) ---------- */
  // Grow the popup while an overlay is open, shrink back when nothing is.
  function syncExpanded() {
    document.body.classList.toggle('expanded', !$('#overlay').hidden || !$('#levelFx').hidden);
  }
  new MutationObserver(syncExpanded).observe($('#overlay'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(syncExpanded).observe($('#levelFx'), { attributes: true, attributeFilter: ['hidden'] });

  function openSheet(html, onClick) {
    $('#sheet').innerHTML = html;
    $('#overlay').hidden = false;
    $('#sheet').onclick = ev => {
      if (ev.target.closest('.x')) return closeSheet();
      if (onClick) onClick(ev);
    };
  }
  function closeSheet() { $('#overlay').hidden = true; $('#sheet').innerHTML = ''; }
  $('#overlay').addEventListener('mousedown', ev => { if (ev.target.id === 'overlay') closeSheet(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#overlay').hidden) closeSheet(); });

  /* ----- pet sheet ----- */
  function openPetSheet() {
    const p = state.pet, st = VP.stageOf(p.exp);
    const parts = VP.SLOTS.map(s => {
      const unlocked = s.unlock <= st;
      return `<div class="${unlocked ? '' : 'locked'}"><span>${s.label}:</span> ${unlocked ? esc(p.dna[s.key]) : `🔒 stage ${s.unlock}`}</div>`;
    }).join('');
    const extras = [[10, 'Glow'], [11, 'Levitate'], [12, 'Holo shimmer']]
      .map(([n, l]) => `<div class="${st >= n ? '' : 'locked'}"><span>${l}:</span> ${st >= n ? 'yes' : `🔒 stage ${n}`}</div>`).join('');
    const log = p.log.slice().reverse().map(e => `<li><b>LV ${e.lv}</b> ${esc(e.text)}</li>`).join('');
    const born = new Date(p.born || Date.now()).toLocaleDateString();
    openSheet(`
      <h2>PET STATS<button class="x" title="Close">✕</button></h2>
      <div class="namerow"><input id="petNameIn" maxlength="16" value="${esc(p.name)}"><button class="btn primary" id="petNameSave">RENAME</button></div>
      <p class="hint">Born ${esc(born)} · ${p.exp} EXP · LV ${VP.levelOf(p.exp)} · ${esc(VP.STAGES[st - 1].name)}</p>
      <h3>PARTS</h3>
      <div class="parts">${parts}${extras}</div>
      <h3>MUTATION LOG</h3>
      <ul class="log">${log || '<li>Nothing yet.</li>'}</ul>
    `, ev => {
      if (ev.target.id === 'petNameSave') {
        const v = $('#petNameIn').value.trim().toUpperCase();
        if (v) { state.pet.name = v; save(); renderPet(true); toast('Renamed to ' + v); }
      }
      if (ev.target.id === 'petReset') {
        const b = ev.target;
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'CLICK AGAIN TO CONFIRM'; return; }
        const snap = snapshot();
        state.pet = VP.newPet(state.pet.name);
        save(); closeSheet(); renderAll();
        toast('A new egg appeared', snap);
      }
    });
    $('#petNameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#petNameSave').click(); });
  }
  $('#petSvg').addEventListener('click', openPetSheet);
  $('#levelFx').addEventListener('click', () => { $('#levelFx').hidden = true; });

  /* ----- import / export ----- */
  const LLM_HOWTO = 'Edit "tasks". Each task: "title" (required), "list" = "active" | "backlog" | "done", optional "day" ("YYYY-MM-DD"), "hours" (number), "priority" = "high" | "medium" | "low", "notes". Array order = order inside each list (top first). Keep "id" on existing tasks; omit "id" for new tasks. Remove a task from the array to delete it. Marking a task "done" here does not give the pet EXP.';

  function exportObj(includePet) {
    const ordered = [...byList('active'), ...byList('backlog'), ...byList('done')];
    const o = {
      app: 'VaporPet Tasks',
      schema: 1,
      exportedAt: new Date().toISOString(),
      howTo: LLM_HOWTO,
      tasks: ordered.map(t => {
        const x = { id: t.id, title: t.title, list: t.list };
        if (t.day) x.day = t.day;
        if (t.hours > 0) x.hours = t.hours;
        if (t.priority && t.priority !== 'medium') x.priority = t.priority;
        if (t.notes) x.notes = t.notes;
        if (t.list === 'done' && t.completedAt) x.completedAt = new Date(t.completedAt).toISOString();
        return x;
      })
    };
    if (includePet) o.pet = state.pet;
    return o;
  }
  const exportText = includePet => JSON.stringify(exportObj(includePet), null, 2);
  function llmText() {
    return 'Below is my task list as JSON from my task app. I will tell you what changed (new tasks, finished tasks, new priorities, scheduled days/hours). ' +
      'Reply with the complete updated JSON only, in exactly the same format, inside one ```json code block.\n\n' + JSON.stringify(exportObj(false), null, 2);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }

  function download(text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `vaporpet-tasks-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Lenient parser: accepts our export, a bare array, {active:[],backlog:[]}, strings, ```json fences.
  function parseImport(text) {
    let s = String(text || '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    if (!s.startsWith('{') && !s.startsWith('[')) {
      const i = Math.min(...['{', '['].map(c => s.indexOf(c)).filter(i => i >= 0));
      if (isFinite(i)) s = s.slice(i);
    }
    const data = JSON.parse(s);
    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data.tasks)) raw = data.tasks;
    else if (data.active || data.backlog || data.done) {
      for (const l of LISTS) (data[l] || []).forEach(t => raw.push(typeof t === 'string' ? { title: t, list: l } : Object.assign({}, t, { list: l })));
    } else throw new Error('No "tasks" array found.');
    const now = Date.now();
    const seen = new Set();
    const tasks = raw.map(t => (typeof t === 'string' ? { title: t } : t)).filter(t => t && typeof t === 'object').map(t => {
      const title = String(t.title || t.name || t.task || t.text || '').trim();
      if (!title) return null;
      let list = String(t.list || t.status || '').toLowerCase();
      if (t.done === true || t.completed === true || list === 'complete' || list === 'completed') list = 'done';
      if (list === 'later' || list === 'someday') list = 'backlog';
      if (list === 'todo' || list === 'current' || list === 'now') list = 'active';
      if (!LISTS.includes(list)) list = 'active';
      let id = t.id ? String(t.id) : uid();
      if (seen.has(id)) id = uid();
      seen.add(id);
      const day = typeof t.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.day) ? t.day : '';
      const hours = Math.max(0, Math.min(24, parseFloat(t.hours) || 0));
      const pRaw = String(t.priority || '').toLowerCase();
      const priority = PRIORITIES.includes(pRaw) ? pRaw : 'medium';
      const completedAt = list === 'done' ? (Date.parse(t.completedAt) || now) : null;
      return { id, title: title.slice(0, 300), list, day, hours, priority, notes: t.notes ? String(t.notes) : '', createdAt: Date.parse(t.createdAt) || now, completedAt };
    }).filter(Boolean);
    return { tasks, pet: data && !Array.isArray(data) && data.pet && typeof data.pet === 'object' ? data.pet : null };
  }

  function applyImport(parsed, mode, withPet) {
    const snap = snapshot();
    const old = new Map(state.tasks.map(t => [t.id, t]));
    // keep the EXP-awarded flag so re-completing a known task never double-counts
    const carry = t => { const o = old.get(t.id); if (o && o.expAwarded) t.expAwarded = true; if (o && o.list === 'done' && t.list === 'done' && o.completedAt) t.completedAt = o.completedAt; return t; };
    let added = 0, updated = 0;
    if (mode === 'replace') {
      parsed.tasks.forEach(t => (old.has(t.id) ? updated++ : added++));
      state.tasks = parsed.tasks.map(carry);
    } else {
      for (const t of parsed.tasks) {
        const o = old.get(t.id);
        if (o) {
          o.title = t.title; o.notes = t.notes; o.day = t.day; o.hours = t.hours; o.priority = t.priority;
          if (o.list !== t.list) { o.list = t.list; o.completedAt = t.completedAt; }
          updated++;
        } else { state.tasks.push(t); added++; }
      }
    }
    let petMsg = '';
    if (withPet && parsed.pet) { state.pet = VP.ensureDna(Object.assign(VP.newPet(), parsed.pet)); petMsg = ' Pet restored.'; }
    save();
    renderAll();
    toast(`Imported: ${added} new, ${updated} updated`, snap);
    return `${mode === 'replace' ? 'Replaced task list' : 'Merged'}: ${added} new, ${updated} updated.${petMsg}`;
  }

  function openDataSheet() {
    openSheet(`
      <h2>IMPORT / EXPORT<button class="x" title="Close">✕</button></h2>
      <h3>EXPORT</h3>
      <div class="btns">
        <button class="btn primary" data-d="llm" title="Copies instructions + JSON, ready to paste into ChatGPT/Claude/etc.">COPY FOR LLM</button>
        <button class="btn" data-d="copy">COPY JSON</button>
        <button class="btn" data-d="dl">DOWNLOAD .JSON</button>
      </div>
      <h3>IMPORT</h3>
      <p class="hint">Paste JSON. It replaces your task list.</p>
      <textarea id="impText" placeholder='{"tasks":[{"title":"Email Sam","list":"active","day":"2026-11-16","hours":1,"priority":"high"}]}'></textarea>
      <div class="btns"><button class="btn primary" data-d="replace">IMPORT</button></div>
      <div class="status" id="dStatus"></div>
    `, async ev => {
      const b = ev.target.closest('[data-d]'); if (!b) return;
      const status = $('#dStatus');
      const set = (m, err) => { status.textContent = m; status.className = 'status' + (err ? ' err' : ''); };
      try {
        switch (b.dataset.d) {
          case 'llm': set((await copy(llmText())) ? 'Copied! Paste it into your LLM, tell it what changed, then paste its reply below.' : 'Copy failed.', false); break;
          case 'copy': set((await copy(exportText(false))) ? 'JSON copied to clipboard.' : 'Copy failed.'); break;
          case 'dl': download(exportText(false)); set('Download started.'); break;
          case 'replace': {
            const txt = $('#impText').value;
            if (!txt.trim()) return set('Paste some JSON first.', true);
            const parsed = parseImport(txt);
            if (!parsed.tasks.length) return set('That JSON has no tasks, so nothing was imported.', true);
            set(applyImport(parsed, 'replace', false));
            break;
          }
        }
      } catch (e) {
        set('Could not read that JSON: ' + e.message, true);
      }
    });
  }
  $('#btnData').addEventListener('click', openDataSheet);

  $('#btnFull').addEventListener('click', () => {
    if (hasChrome && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab=1') });
    } else {
      window.open(location.pathname + '?tab=1', '_blank');
    }
  });

  /* ---------- boot ---------- */
  async function boot() {
    if (isTab) document.body.classList.add('tabmode');
    state = sanitizeState(await store.get());
    if (!state.savedAt) save();
    setMode(state.ui.mode);
    setInterval(() => renderPet(), 60000);
    if (hasChrome && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORE_KEY]) return;
        const nv = changes[STORE_KEY].newValue;
        if (nv && nv.savedBy !== INSTANCE) {
          const ui = state.ui;
          state = sanitizeState(nv);
          state.ui = ui;
          renderAll();
        }
      });
    }
    if (state.ui.mode === 'list') $('#addInput').focus();
  }
  boot();

  // Debug hook for previewing stages in the console: VaporPetDebug.setExp(37)
  window.VaporPetDebug = {
    setExp(n) { state.pet.exp = n; VP.ensureDna(state.pet); save(); renderPet(true); },
    mutate() { state.pet.exp += VP.EXP_PER_LEVEL - (state.pet.exp % VP.EXP_PER_LEVEL); const l = VP.levelUp(state.pet); save(); renderAll(); showLevelUp(l); },
    state: () => state
  };
})();