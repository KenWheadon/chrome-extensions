/* Target Tasks v2 — EXP, levels, badges, focus mode & a little buddy */
'use strict';

/* ───────────────────────── Config ───────────────────────── */

// EXP needed to go from level L to L+1.
// Starts at 3 and climbs linearly, then plateaus at 20 EXP per level from level 30 on.
const PLATEAU_LEVEL = 30;
const PLATEAU_EXP = 20;
const START_EXP = 3;
function expForLevel(L) {
    if (L >= PLATEAU_LEVEL) return PLATEAU_EXP;
    return Math.round(START_EXP + (L - 1) * (PLATEAU_EXP - START_EXP) / (PLATEAU_LEVEL - 1));
}
function levelInfo(total) {
    let level = 1, into = Math.max(0, total);
    while (into >= expForLevel(level)) { into -= expForLevel(level); level++; }
    return { level, into, need: expForLevel(level) };
}

const RANKS = [
    [1, 'Rookie'], [3, 'Trainee'], [5, 'Apprentice'], [8, 'Spotter'], [10, 'Sharpshooter'],
    [15, 'Marksman'], [20, 'Specialist'], [25, 'Veteran'], [30, 'Bullseye Master'], [40, 'Legend'], [50, 'Mythic'],
];
const rankFor = L => RANKS.filter(([min]) => L >= min).pop()[1];

// Buddy accessory unlocks
const accessoryFor = L => (L >= 30 ? 'crown' : L >= 10 ? 'star' : 'sprout');

// Daily badges: complete N tasks in a single day
const BADGES = [
    { id: 'd3', n: 3, icon: '☕', name: 'Warm Up' },
    { id: 'd5', n: 5, icon: '🔥', name: 'On a Roll' },
    { id: 'd8', n: 8, icon: '🎯', name: 'Locked In' },
    { id: 'd12', n: 12, icon: '🏹', name: 'Bullseye' },
    { id: 'd20', n: 20, icon: '⚡', name: 'Blitz' },
];

const SWATCHES = ['#e74c3c', '#ff8a4c', '#f5b82e', '#2eaf6b', '#1abc9c', '#3498db', '#6c5ce7', '#e84393', '#8d6e63', '#636e72'];

const DEFAULT_STATE = {
    tasks: [],
    totalExp: 0,
    daily: {},          // { 'YYYY-MM-DD': completedCount }
    badges: {},         // { badgeId: { count, last: 'YYYY-MM-DD' } }
    charColor: '#e74c3c',
    view: 'list',       // 'list' | 'focus' | 'hidden'
};
const STORAGE_KEY = 'targetTasksState';

/* ───────────────────────── Storage ───────────────────────── */

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const myRev = Math.random().toString(36).slice(2);

const store = {
    async load() {
        let saved = null;
        if (hasChromeStorage) {
            saved = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null;
        } else {
            try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { }
        }
        if (!saved) {
            // Migrate tasks from v1 (localStorage 'targetTasks')
            saved = { ...DEFAULT_STATE };
            try {
                const old = JSON.parse(localStorage.getItem('targetTasks'));
                if (Array.isArray(old)) saved.tasks = old;
            } catch (_) { }
        }
        return { ...DEFAULT_STATE, ...saved };
    },
    async save(s) {
        const data = { ...s, _rev: myRev + ':' + Date.now() };
        if (hasChromeStorage) await chrome.storage.local.set({ [STORAGE_KEY]: data });
        else try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) { }
    },
};

/* ───────────────────────── Helpers ───────────────────────── */

const $ = id => document.getElementById(id);
const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clampExp = v => Math.min(99, Math.max(1, Math.round(Number(v) || 1)));

function normalizeTasks(list) {
    const seen = new Set();
    return list
        .filter(t => t && typeof t.text === 'string' && t.text.trim())
        .map(t => {
            let id = t.id != null ? String(t.id) : uid();
            if (seen.has(id)) id = uid();
            seen.add(id);
            return {
                id,
                text: t.text.trim(),
                completed: !!t.completed,
                exp: t.exp != null ? clampExp(t.exp) : null,   // null = default (1)
                awarded: Number(t.awarded) || 0,
                completedOn: t.completedOn || null,
            };
        });
}
const taskExp = t => t.exp || 1;

// colour shading for the buddy
function shade(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ───────────────────────── Character SVG ───────────────────────── */

const CHAR_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <ellipse class="c-shadow" cx="32" cy="60" rx="15" ry="2.6"/>
  <g class="c-body">
    <!-- accessories -->
    <g class="c-acc c-sprout">
      <rect x="31" y="9" width="2" height="9" rx="1" fill="#3e8e41"/>
      <path d="M32 12 C27 12 23.5 9 24 5 C28.5 5 31.5 8 32 12Z" fill="#5cbf60"/>
      <path d="M32 11 C36 10.5 39.5 8 39 4 C35 4 32.5 7 32 11Z" fill="#7bd67f"/>
    </g>
    <g class="c-acc c-star">
      <rect x="31" y="7" width="2" height="11" rx="1" class="c-dark"/>
      <path d="M32 0.5 L33.9 4.4 L38.2 5 L35.1 8 L35.8 12.3 L32 10.3 L28.2 12.3 L28.9 8 L25.8 5 L30.1 4.4Z" fill="#f5b82e" stroke="#d99a0b" stroke-width=".8"/>
    </g>
    <g class="c-acc c-crown">
      <path d="M21 18 L19.5 6 L26 11 L32 3 L38 11 L44.5 6 L43 18 Z" fill="#f5b82e" stroke="#d99a0b" stroke-width="1"/>
      <circle cx="32" cy="12.5" r="2" fill="#e74c3c"/>
      <circle cx="25" cy="15" r="1.3" fill="#3498db"/>
      <circle cx="39" cy="15" r="1.3" fill="#2eaf6b"/>
    </g>
    <!-- arms + feet -->
    <ellipse class="c-dark c-arm-l" cx="12" cy="42" rx="3.6" ry="6.5"/>
    <ellipse class="c-dark c-arm-r" cx="52" cy="42" rx="3.6" ry="6.5"/>
    <ellipse class="c-dark" cx="23.5" cy="56" rx="6" ry="3.4"/>
    <ellipse class="c-dark" cx="40.5" cy="56" rx="6" ry="3.4"/>
    <!-- body -->
    <rect class="c-main" x="11" y="16" width="42" height="41" rx="19"/>
    <ellipse class="c-light" cx="32" cy="45" rx="12.5" ry="8.5" opacity=".55"/>
    <ellipse cx="22" cy="23" rx="5" ry="3" fill="#fff" opacity=".28" transform="rotate(-25 22 23)"/>
    <!-- face -->
    <g class="c-eyes">
      <ellipse cx="24.5" cy="32" rx="4.2" ry="5" fill="#fff"/>
      <ellipse cx="39.5" cy="32" rx="4.2" ry="5" fill="#fff"/>
      <circle cx="25.4" cy="33" r="2.5" fill="#1d1d24"/>
      <circle cx="40.4" cy="33" r="2.5" fill="#1d1d24"/>
      <circle cx="26.2" cy="31.9" r=".9" fill="#fff"/>
      <circle cx="41.2" cy="31.9" r=".9" fill="#fff"/>
    </g>
    <circle cx="18.5" cy="39.5" r="2.8" fill="#ff8fa3" opacity=".55"/>
    <circle cx="45.5" cy="39.5" r="2.8" fill="#ff8fa3" opacity=".55"/>
    <path class="c-mouth" d="M28.5 40 Q32 43.5 35.5 40" stroke="#1d1d24" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path class="c-mouth-open" d="M27.5 39.5 Q32 47.5 36.5 39.5 Z" fill="#1d1d24"/>
  </g>
  <path class="c-sparkle" d="M7 14 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2Z" fill="#f5b82e"/>
  <path class="c-sparkle" d="M57 10 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1Z" fill="#f5b82e"/>
  <path class="c-sparkle" d="M58 30 l.8 1.8 1.8 .8 -1.8 .8 -.8 1.8 -.8 -1.8 -1.8 -.8 1.8 -.8Z" fill="#fff"/>
</svg>`;

/* ───────────────────────── State ───────────────────────── */

let state = { ...DEFAULT_STATE };
let undoStack = null;          // { tasks } snapshot for undo
let toastTimer = null;
let dragId = null;

async function commit() { await store.save(state); }

/* ───────────────────────── Rendering ───────────────────────── */

function applyCharColor() {
    const c = state.charColor || DEFAULT_STATE.charColor;
    const root = document.documentElement.style;
    root.setProperty('--char', c);
    root.setProperty('--char-dark', shade(c, -0.25));
    root.setProperty('--char-light', shade(c, 0.55));
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === c));
    $('custom-color').value = c;
}

function renderPlayer() {
    const { level, into, need } = levelInfo(state.totalExp);
    $('level').textContent = level;
    $('rank').textContent = rankFor(level);
    $('xp-fill').style.width = (into / need * 100) + '%';
    $('xpbar').setAttribute('aria-valuenow', into);
    $('xpbar').setAttribute('aria-valuemax', need);
    $('xp-text').textContent = `${into} / ${need} EXP`;
    $('xp-next').textContent = `${need - into} to LV ${level + 1}`;
    const n = state.daily[todayKey()] || 0;
    $('today').innerHTML = `<b>${n}</b> done today`;

    const acc = 'acc-' + accessoryFor(level);
    ['char-main', 'char-lu'].forEach(id => {
        const el = $(id);
        el.classList.remove('acc-sprout', 'acc-star', 'acc-crown');
        el.classList.add(acc);
    });
}

function renderBadges(newId) {
    const today = todayKey();
    const n = state.daily[today] || 0;
    const wrap = $('badges');
    wrap.innerHTML = '';
    BADGES.forEach(b => {
        const rec = state.badges[b.id];
        const el = document.createElement('div');
        el.className = 'badge' + (rec ? ' earned' : '') + (rec && rec.last === today ? ' today-earned' : '') + (b.id === newId ? ' new' : '');
        const times = rec ? rec.count : 0;
        el.title = `${b.name}: complete ${b.n} tasks in one day` + (times ? `\nEarned ${times}×` : '') + (rec && rec.last === today ? ' (earned today!)' : `\nToday: ${Math.min(n, b.n)}/${b.n}`);
        el.innerHTML = `
      <span class="b-icon">${b.icon}</span>
      <span class="b-name">${b.name}</span>
      <span>${b.n}/day</span>
      ${times ? `<span class="b-count">×${times}</span>` : ''}
      ${!(rec && rec.last === today) && n > 0 ? `<span class="b-progress"><i style="width:${Math.min(100, n / b.n * 100)}%"></i></span>` : ''}`;
        wrap.appendChild(el);
    });
}

const ICON_TRASH = '<svg viewBox="0 0 16 16"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.8v4.4M9.2 6.8v4.4"/></svg>';
const ICON_TARGET = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/><path d="M8 0v3M8 13v3M0 8h3M13 8h3"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg>';
const ICON_SKIP = '<svg viewBox="0 0 16 16"><path d="M3 3l6 5-6 5zM12 3v10"/></svg>';

function currentTask() { return state.tasks.find(t => !t.completed); }

function renderList() {
    const ul = $('task-list');
    ul.innerHTML = '';
    const left = state.tasks.filter(t => !t.completed).length;
    const done = state.tasks.length - left;
    $('list-count').textContent = state.tasks.length ? `${left} to go · ${done} done` : '';
    $('clear-done').hidden = done === 0;

    if (!state.tasks.length) {
        ul.innerHTML = `<li class="empty"><b>No targets yet</b>Add one above, or import a JSON list.</li>`;
        return;
    }
    const cur = currentTask();

    state.tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.completed ? ' completed' : '') + (cur && cur.id === task.id ? ' current' : '');
        li.dataset.id = task.id;

        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '⋮⋮';
        handle.title = 'Drag to reorder';
        handle.addEventListener('mousedown', () => { li.draggable = true; });

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'check';
        cb.checked = task.completed;
        cb.setAttribute('aria-label', 'Complete task');
        cb.addEventListener('change', () => toggleTask(task.id, cb.checked, li));

        const text = document.createElement('span');
        text.className = 't-text';
        text.textContent = task.text;
        text.title = 'Double-click to edit';
        text.addEventListener('dblclick', () => startEditText(task, text));

        const chip = document.createElement('button');
        chip.className = 'exp-chip' + (task.exp ? '' : ' default');
        chip.textContent = `+${taskExp(task)} EXP`;
        chip.title = task.completed ? `Earned ${task.awarded || taskExp(task)} EXP` : 'Click to set EXP reward';
        chip.disabled = task.completed;
        chip.addEventListener('click', () => startEditExp(task, chip));

        const del = document.createElement('button');
        del.className = 'del-btn';
        del.innerHTML = ICON_TRASH;
        del.title = 'Delete task';
        del.setAttribute('aria-label', 'Delete task');
        del.addEventListener('click', () => deleteTask(task.id, li));

        li.append(handle, cb, text, chip, del);

        // drag & drop (handle-initiated)
        li.addEventListener('dragstart', e => {
            dragId = task.id;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', task.id);
        });
        li.addEventListener('dragend', () => {
            li.draggable = false;
            li.classList.remove('dragging');
            document.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
        });
        li.addEventListener('dragover', e => {
            if (!dragId || dragId === task.id) return;
            e.preventDefault();
            const r = li.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            li.classList.toggle('drop-after', after);
            li.classList.toggle('drop-before', !after);
        });
        li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
        li.addEventListener('drop', e => {
            e.preventDefault();
            const after = li.classList.contains('drop-after');
            li.classList.remove('drop-before', 'drop-after');
            if (dragId && dragId !== task.id) moveTask(dragId, task.id, after);
            dragId = null;
        });

        ul.appendChild(li);
    });
}

function renderFocus() {
    const wrap = $('focus-view');
    const cur = currentTask();
    const remaining = state.tasks.filter(t => !t.completed).length;

    if (!state.tasks.length) {
        wrap.innerHTML = `<div class="focus-card"><div class="focus-empty"><div class="big">🎯</div><b>Nothing targeted</b>Add some tasks to get started.<br><br><button class="btn primary" data-act="show-list">Open list</button></div></div>`;
    } else if (!cur) {
        wrap.innerHTML = `<div class="focus-card"><div class="focus-empty"><div class="big">🏆</div><b>All targets cleared!</b>Nice work — that's everything on the list.<br><br><button class="btn ghost" data-act="show-list">Show list</button></div></div>`;
    } else {
        wrap.innerHTML = `
      <div class="focus-card" id="focus-card">
        <div class="focus-label">${ICON_TARGET} Current target <span class="exp-chip ${cur.exp ? '' : 'default'}" style="margin-left:auto">+${taskExp(cur)} EXP</span></div>
        <div class="focus-text"></div>
        <div class="focus-actions">
          <button class="btn primary" data-act="complete">${ICON_CHECK} Complete</button>
          ${remaining > 1 ? `<button class="btn ghost" data-act="skip" title="Move to the end of the list">${ICON_SKIP} Later</button>` : ''}
        </div>
        <div class="focus-foot">
          <span>${remaining - 1 ? `${remaining - 1} more in the queue` : 'Last one!'}</span>
          <button class="link-btn" data-act="show-list">Show full list</button>
        </div>
      </div>`;
        wrap.querySelector('.focus-text').textContent = cur.text;
    }
}

function render() {
    document.body.className = 'view-' + state.view;
    document.querySelectorAll('.view-switch button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === state.view));
    applyCharColor();
    renderPlayer();
    renderBadges();
    renderList();
    renderFocus();
}

/* ───────────────────────── Actions ───────────────────────── */

function setView(v) {
    state.view = v;
    if (v === 'hidden') $('color-panel').hidden = true;
    render();
    commit();
}

function addTask(text, exp) {
    text = text.trim();
    if (!text) return;
    state.tasks.push({ id: uid(), text, completed: false, exp: exp ? clampExp(exp) : null, awarded: 0, completedOn: null });
    render();
    commit();
}

function toggleTask(id, done, li) {
    const task = state.tasks.find(t => t.id === id);
    if (!task || task.completed === done) return;
    const before = levelInfo(state.totalExp).level;
    const today = todayKey();

    if (done) {
        task.completed = true;
        task.awarded = taskExp(task);
        task.completedOn = today;
        state.totalExp += task.awarded;
        state.daily[today] = (state.daily[today] || 0) + 1;
    } else {
        // un-checking takes the EXP back, so there's no farming
        task.completed = false;
        state.totalExp = Math.max(0, state.totalExp - (task.awarded || 0));
        if (task.completedOn === today) state.daily[today] = Math.max(0, (state.daily[today] || 0) - 1);
        task.awarded = 0;
        task.completedOn = null;
    }

    // prune old daily counts (keep ~60 days)
    const keys = Object.keys(state.daily).sort();
    while (keys.length > 60) delete state.daily[keys.shift()];

    const newBadge = done ? checkBadges() : null;
    render();
    if (newBadge) renderBadges(newBadge.id);
    commit();

    if (done) {
        floatExp(task.awarded);
        bounce();
        const el = document.querySelector(`.task-item[data-id="${CSS.escape(id)}"]`);
        if (el) el.classList.add('just-done');
        const after = levelInfo(state.totalExp).level;
        if (after > before) setTimeout(() => showLevelUp(after), 450);
        else if (newBadge) toast(`${newBadge.icon} Badge earned: ${newBadge.name} — ${newBadge.n} tasks today!`);
    }
}

function checkBadges() {
    const today = todayKey();
    const n = state.daily[today] || 0;
    let earned = null;
    BADGES.forEach(b => {
        const rec = state.badges[b.id];
        if (n >= b.n && (!rec || rec.last !== today)) {
            state.badges[b.id] = { count: (rec ? rec.count : 0) + 1, last: today };
            earned = b;   // highest one wins the toast
        }
    });
    return earned;
}

function deleteTask(id, li) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    undoStack = JSON.parse(JSON.stringify(state.tasks));
    const [removed] = state.tasks.splice(idx, 1);
    const finish = () => { render(); commit(); };
    if (li) { li.classList.add('removing'); setTimeout(finish, 180); } else finish();
    toast(`Deleted “${removed.text.length > 28 ? removed.text.slice(0, 28) + '…' : removed.text}”`, 'Undo', undo);
}

function undo() {
    if (!undoStack) return;
    state.tasks = undoStack;
    undoStack = null;
    render();
    commit();
    hideToast();
}

function clearCompleted() {
    const n = state.tasks.filter(t => t.completed).length;
    if (!n) return;
    undoStack = JSON.parse(JSON.stringify(state.tasks));
    state.tasks = state.tasks.filter(t => !t.completed);
    render();
    commit();
    toast(`Cleared ${n} completed task${n > 1 ? 's' : ''} (EXP kept)`, 'Undo', undo);
}

function moveTask(fromId, toId, after) {
    const from = state.tasks.findIndex(t => t.id === fromId);
    if (from < 0) return;
    const [item] = state.tasks.splice(from, 1);
    let to = state.tasks.findIndex(t => t.id === toId);
    if (to < 0) to = state.tasks.length;
    state.tasks.splice(to + (after ? 1 : 0), 0, item);
    render();
    commit();
}

function skipTask() {
    const cur = currentTask();
    if (!cur) return;
    const card = $('focus-card');
    const go = () => {
        state.tasks = state.tasks.filter(t => t.id !== cur.id);
        state.tasks.push(cur);
        render();
        commit();
    };
    if (card) { card.classList.add('leaving'); setTimeout(go, 280); } else go();
}

function completeCurrent() {
    const cur = currentTask();
    if (!cur) return;
    const card = $('focus-card');
    if (card) card.classList.add('leaving');
    setTimeout(() => toggleTask(cur.id, true), card ? 280 : 0);
}

function startEditText(task, span) {
    if (task.completed) return;
    const input = document.createElement('input');
    input.className = 't-edit';
    input.value = task.text;
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
        if (done) return; done = true;
        if (save && input.value.trim()) { task.text = input.value.trim(); commit(); }
        render();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

function startEditExp(task, chip) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1; input.max = 99;
    input.className = 'exp-input';
    input.value = taskExp(task);
    chip.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
        if (done) return; done = true;
        if (save) {
            const v = input.value.trim();
            task.exp = v === '' ? null : clampExp(v);
            commit();
        }
        render();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

/* ───────────────────────── Juice ───────────────────────── */

function floatExp(n) {
    const f = document.createElement('span');
    f.className = 'xp-float';
    f.textContent = `+${n} EXP`;
    $('xp-floats').appendChild(f);
    setTimeout(() => f.remove(), 1200);
    const bar = $('xpbar');
    bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
}

function bounce() {
    const c = $('char-main');
    c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop');
    setTimeout(() => c.classList.remove('hop'), 600);
}

let luTimer = null;
function showLevelUp(level) {
    const ov = $('levelup');
    $('lu-level').textContent = level;
    const prevRank = rankFor(level - 1), rank = rankFor(level);
    const prevAcc = accessoryFor(level - 1), acc = accessoryFor(level);
    $('lu-rank').textContent = rank !== prevRank ? `New title: ${rank}` : rank;
    let sub = `Next level in ${expForLevel(level)} EXP`;
    if (acc !== prevAcc) sub = acc === 'star' ? '⭐ Unlocked: star antenna!' : '👑 Unlocked: the crown!';
    $('lu-sub').textContent = sub;

    // confetti
    const conf = $('lu-confetti');
    conf.innerHTML = '';
    const colors = [state.charColor, '#f5b82e', '#ffffff', '#ff8a4c', '#3498db', '#2eaf6b'];
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('i');
        const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 170;
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 60 + 'px');
        p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.15) + 's';
        conf.appendChild(p);
    }

    ov.hidden = false;
    const luChar = $('char-lu');
    [luChar, $('char-main')].forEach(c => { c.classList.remove('dance'); void c.offsetWidth; c.classList.add('dance'); });
    clearTimeout(luTimer);
    luTimer = setTimeout(hideLevelUp, 3800);
}
function hideLevelUp() {
    $('levelup').hidden = true;
    $('char-lu').classList.remove('dance');
    setTimeout(() => $('char-main').classList.remove('dance'), 200);
}

function toast(msg, actionLabel, action) {
    $('toast-msg').textContent = msg;
    const btn = $('toast-action');
    if (actionLabel) {
        btn.hidden = false;
        btn.textContent = actionLabel;
        btn.onclick = action;
    } else btn.hidden = true;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 5500 : 3200);
}
function hideToast() { $('toast').classList.remove('show'); }

/* ───────────────────────── Import / export ───────────────────────── */

function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
        let data;
        try { data = JSON.parse(ev.target.result); } catch (_) { return toast('⚠️ Could not read that file — is it valid JSON?'); }
        if (data && !Array.isArray(data) && Array.isArray(data.tasks)) data = data.tasks;
        if (!Array.isArray(data)) return toast('⚠️ Expected a list of tasks. Try “Blank format” to see the structure.');
        const tasks = normalizeTasks(data);
        if (!tasks.length) return toast('⚠️ No tasks with a "text" field found.');
        undoStack = JSON.parse(JSON.stringify(state.tasks));
        // already-completed imported tasks don't grant EXP
        tasks.forEach(t => { if (t.completed) { t.awarded = 0; t.completedOn = null; } });
        state.tasks = tasks;
        render();
        commit();
        toast(`Imported ${tasks.length} task${tasks.length > 1 ? 's' : ''}`, 'Undo', undo);
    };
    reader.readAsText(file);
}

/* ───────────────────────── Wiring ───────────────────────── */

function wire() {
    const logo = $('brand-logo');
    logo.addEventListener('error', () => { logo.style.display = 'none'; });

    document.querySelectorAll('.view-switch button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    $('focus-view').addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'complete') completeCurrent();
        if (act.dataset.act === 'skip') skipTask();
        if (act.dataset.act === 'show-list') setView('list');
    });

    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        addTask($('add-text').value, $('add-exp').value);
        $('add-text').value = '';
        $('add-exp').value = '';
        $('add-text').focus();
    });

    $('clear-done').addEventListener('click', clearCompleted);

    // colour picker
    const sw = $('swatches');
    SWATCHES.forEach(c => {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = c;
        b.dataset.color = c;
        b.title = c;
        b.addEventListener('click', () => { state.charColor = c; applyCharColor(); bounce(); commit(); });
        sw.appendChild(b);
    });
    $('custom-color').addEventListener('input', e => { state.charColor = e.target.value; applyCharColor(); });
    $('custom-color').addEventListener('change', () => { bounce(); commit(); });
    $('char-btn').addEventListener('click', () => {
        if (state.view === 'hidden') { bounce(); return; }
        $('color-panel').hidden = !$('color-panel').hidden;
        bounce();
    });

    // import / export
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) importFile(f);
        e.target.value = '';
    });
    $('export-btn').addEventListener('click', () => {
        download(`target-tasks-${todayKey()}.json`, state.tasks.map(({ id, text, completed, exp }) => ({ id, text, completed, exp: exp || 1 })));
    });
    $('export-blank-btn').addEventListener('click', () => {
        download('blank_llm_format.json', [
            { id: 1, text: 'Task instruction goes here', completed: false, exp: 1 },
            { id: 2, text: 'A bigger task worth more EXP (exp is optional, defaults to 1)', completed: false, exp: 5 },
        ]);
    });

    // level-up overlay
    $('levelup').addEventListener('click', hideLevelUp);

    // keyboard shortcuts (when not typing)
    document.addEventListener('keydown', e => {
        if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'l') setView('list');
        else if (k === 'f') setView('focus');
        else if (k === 'h') setView('hidden');
        else if (k === 'escape' && !$('levelup').hidden) hideLevelUp();
        else if (k === 'n' && state.view === 'list') { e.preventDefault(); $('add-text').focus(); }
    });

    document.addEventListener('mouseup', () => {
        document.querySelectorAll('.task-item[draggable="true"]:not(.dragging)').forEach(li => { li.draggable = false; });
    });

    // keep popup + side panel in sync
    if (hasChromeStorage) {
        chrome.storage.onChanged.addListener((changes, area) => {
            const c = changes[STORAGE_KEY];
            if (area !== 'local' || !c || !c.newValue) return;
            if (String(c.newValue._rev || '').startsWith(myRev + ':')) return;
            state = { ...DEFAULT_STATE, ...c.newValue };
            state.tasks = normalizeTasks(state.tasks);
            render();
        });
    }
}

function detectContext() {
    const ctx = new URLSearchParams(location.search).get('ctx');
    if (ctx === 'popup') document.documentElement.classList.add('is-popup');

    // "Keep open" button → Chrome side panel, so the current task stays on screen
    const pin = $('pin-btn');
    if (ctx === 'popup' && typeof chrome !== 'undefined' && chrome.sidePanel && chrome.windows) {
        let winId = null;
        chrome.windows.getCurrent(w => { winId = w && w.id; });
        pin.hidden = false;
        pin.addEventListener('click', () => {
            if (winId == null) return;
            chrome.sidePanel.open({ windowId: winId }).then(() => window.close()).catch(() => toast('Could not open the side panel in this Chrome version.'));
        });
    }
}

/* ───────────────────────── Init ───────────────────────── */

(async function init() {
    document.querySelectorAll('.char').forEach(el => { el.innerHTML = CHAR_SVG; });
    detectContext();
    wire();
    state = await store.load();
    state.tasks = normalizeTasks(state.tasks);
    if (!['list', 'focus', 'hidden'].includes(state.view)) state.view = 'list';
    // first run after upgrade: persist migrated data
    commit();
    render();
})();