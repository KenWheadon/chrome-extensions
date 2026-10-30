/* Target Tasks v2.1 — EXP, levels, badges, focused single-task mode, backlog & a little buddy */
'use strict';

/* ───────────────────────── Config ───────────────────────── */

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
    view: 'list',       // 'list' | 'focus'
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
                backlog: !!t.backlog,
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
let undoStack = null;
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
const ICON_CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg>';
const ICON_TOP = '<svg viewBox="0 0 16 16"><path d="M8 13.5V4M4 7.5l4-4 4 4M2.5 2.5h11"/></svg>';
const ICON_TO_BACKLOG = '<svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v2.5h-11zM3.5 6v6.5a1 1 0 001 1h7a1 1 0 001-1V6M6 8.5h4"/></svg>';
const ICON_FROM_BACKLOG = '<svg viewBox="0 0 16 16"><path d="M2.5 6h11M3.5 6v6.5a1 1 0 001 1h7a1 1 0 001-1V6M8 9.5V2.5M5 5.5L8 2.5l3 3"/></svg>';

function currentTask() {
    return state.tasks.find(t => !t.completed && !t.backlog);
}

function createTaskItem(task, isBacklog, cur) {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.completed ? ' completed' : '') + (cur && cur.id === task.id ? ' current' : '') + (isBacklog ? ' is-backlog' : '');
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

    // Action buttons group
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    // 1. Send to top button
    const topBtn = document.createElement('button');
    topBtn.className = 'task-btn top-btn';
    topBtn.innerHTML = ICON_TOP;
    topBtn.title = isBacklog ? 'Move out of backlog to top of list' : 'Send to top';
    topBtn.setAttribute('aria-label', 'Send to top');
    topBtn.addEventListener('click', () => sendToTop(task.id));
    actions.appendChild(topBtn);

    // 2. Backlog toggle button
    const backlogBtn = document.createElement('button');
    backlogBtn.className = 'task-btn backlog-btn';
    backlogBtn.innerHTML = isBacklog ? ICON_FROM_BACKLOG : ICON_TO_BACKLOG;
    backlogBtn.title = isBacklog ? 'Move to active list' : 'Send to backlog';
    backlogBtn.setAttribute('aria-label', isBacklog ? 'Move to active list' : 'Send to backlog');
    backlogBtn.addEventListener('click', () => toggleBacklog(task.id));
    actions.appendChild(backlogBtn);

    // 3. Delete button
    const del = document.createElement('button');
    del.className = 'task-btn del-btn';
    del.innerHTML = ICON_TRASH;
    del.title = 'Delete task';
    del.setAttribute('aria-label', 'Delete task');
    del.addEventListener('click', () => deleteTask(task.id, li));
    actions.appendChild(del);

    li.append(handle, cb, text, chip, actions);

    // Drag & drop
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

    return li;
}

function renderList() {
    const ul = $('task-list');
    const backlogUl = $('backlog-list');
    ul.innerHTML = '';
    backlogUl.innerHTML = '';

    const activeTasks = state.tasks.filter(t => !t.backlog);
    const backlogTasks = state.tasks.filter(t => t.backlog);

    const left = activeTasks.filter(t => !t.completed).length;
    const done = activeTasks.filter(t => t.completed).length;
    $('list-count').textContent = activeTasks.length ? `${left} to go · ${done} done` : '';
    
    const totalDone = state.tasks.filter(t => t.completed).length;
    $('clear-done').hidden = totalDone === 0;

    const cur = currentTask();

    // Render active tasks
    if (!activeTasks.length) {
        ul.innerHTML = `<li class="empty"><b>No active targets</b>Add one above, or send an item from your backlog.</li>`;
    } else {
        activeTasks.forEach(task => {
            ul.appendChild(createTaskItem(task, false, cur));
        });
    }

    // Render backlog
    $('backlog-count').textContent = backlogTasks.length;
    if (!backlogTasks.length) {
        backlogUl.innerHTML = `<li class="backlog-empty">Backlog is empty. Move items here to save them for later.</li>`;
    } else {
        backlogTasks.forEach(task => {
            backlogUl.appendChild(createTaskItem(task, true, cur));
        });
    }
}

function renderFocus() {
    const wrap = $('focus-view');
    const cur = currentTask();

    if (!cur) {
        wrap.innerHTML = `
          <div class="focus-card">
            <div class="focus-empty">
              <div class="big">🎯</div>
              <b>No active targets</b>
              Switch to the List tab to choose or add tasks.
            </div>
          </div>`;
        return;
    }

    wrap.innerHTML = `
      <div class="focus-card" id="focus-card">
        <div class="focus-text"></div>
        <div class="focus-actions">
          <button class="btn primary" data-act="complete">${ICON_CHECK} Complete</button>
        </div>
      </div>`;
    wrap.querySelector('.focus-text').textContent = cur.text;
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
    render();
    commit();
}

function addTask(text, exp) {
    text = text.trim();
    if (!text) return;
    const newTask = {
        id: uid(),
        text,
        completed: false,
        exp: exp ? clampExp(exp) : null,
        awarded: 0,
        completedOn: null,
        backlog: false,
    };
    // Insert before the first backlog task so active items stay together
    const firstBacklogIdx = state.tasks.findIndex(t => t.backlog);
    if (firstBacklogIdx === -1) {
        state.tasks.push(newTask);
    } else {
        state.tasks.splice(firstBacklogIdx, 0, newTask);
    }
    render();
    commit();
}

function sendToTop(id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const [task] = state.tasks.splice(idx, 1);
    task.backlog = false;
    state.tasks.unshift(task);
    render();
    commit();
}

function toggleBacklog(id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const [task] = state.tasks.splice(idx, 1);
    if (task.backlog) {
        // Un-backlog: move to end of active list
        task.backlog = false;
        const lastActiveIdx = state.tasks.map(t => !t.backlog).lastIndexOf(true);
        if (lastActiveIdx === -1) {
            state.tasks.unshift(task);
        } else {
            state.tasks.splice(lastActiveIdx + 1, 0, task);
        }
    } else {
        // Send to backlog: move to end of backlog
        task.backlog = true;
        state.tasks.push(task);
    }
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
        task.completed = false;
        state.totalExp = Math.max(0, state.totalExp - (task.awarded || 0));
        if (task.completedOn === today) state.daily[today] = Math.max(0, (state.daily[today] || 0) - 1);
        task.awarded = 0;
        task.completedOn = null;
    }

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
            earned = b;
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
    
    // Adopts the backlog status of the dropped item's context
    const target = state.tasks[to];
    if (target) {
        item.backlog = target.backlog;
    }
    state.tasks.splice(to + (after ? 1 : 0), 0, item);
    render();
    commit();
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
    if (!c) return;
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
    [luChar, $('char-main')].forEach(c => { if (c) { c.classList.remove('dance'); void c.offsetWidth; c.classList.add('dance'); } });
    clearTimeout(luTimer);
    luTimer = setTimeout(hideLevelUp, 3800);
}
function hideLevelUp() {
    $('levelup').hidden = true;
    $('char-lu').classList.remove('dance');
    const m = $('char-main');
    if (m) setTimeout(() => m.classList.remove('dance'), 200);
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
        download(`target-tasks-${todayKey()}.json`, state.tasks.map(({ id, text, completed, exp, backlog }) => ({
            id,
            text,
            completed,
            exp: exp || 1,
            backlog: !!backlog,
        })));
    });
    $('export-blank-btn').addEventListener('click', () => {
        download('blank_llm_format.json', [
            { id: 1, text: 'Task instruction goes here', completed: false, exp: 1, backlog: false },
            { id: 2, text: 'A task saved in the backlog for later', completed: false, exp: 2, backlog: true },
        ]);
    });

    // level-up overlay
    $('levelup').addEventListener('click', hideLevelUp);

    // keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'l') setView('list');
        else if (k === 'f') setView('focus');
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
    if (!['list', 'focus'].includes(state.view)) state.view = 'list';
    commit();
    render();
})();