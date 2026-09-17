const STORE_KEY = 'onsite-todos-overrides-v1';
const PRI_ORDER = { high: 0, med: 1, low: 2 };
const SECTION_ORDER = [
  { key: 'hot', title: 'Hot / ASAP', match: t => t.status !== 'done' && (isAsap(t) || isDueSoon(t, 1)) },
  { key: 'high', title: 'High', match: t => t.status === 'open' && t.priority === 'high' && !isAsap(t) && !isDueSoon(t, 1) },
  { key: 'waiting', title: 'Waiting', match: t => t.status === 'waiting' },
  { key: 'med', title: 'Medium', match: t => t.status === 'open' && t.priority === 'med' && !isAsap(t) && !isDueSoon(t, 1) },
  { key: 'low', title: 'Low', match: t => t.status === 'open' && t.priority === 'low' && !isAsap(t) && !isDueSoon(t, 1) },
  { key: 'done', title: 'Done', match: t => t.status === 'done' },
];

let data = null;
let filter = 'all';
let calFilter = 'all';
let view = 'todos';
let selectedId = null;
let selectedKind = 'todo';

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
  catch { return {}; }
}
function saveOverrides(map) {
  localStorage.setItem(STORE_KEY, JSON.stringify(map));
}
function mergeTodos(raw) {
  const overrides = loadOverrides();
  return (raw.todos || []).map(t => {
    const o = overrides[t.id] || {};
    return { ...t, status: o.status || t.status };
  });
}
function isAsap(t) {
  const d = (t.due || '').toLowerCase();
  return d.includes('asap') || d.includes('today');
}
function parseDueDate(due) {
  if (!due) return null;
  const m = String(due).match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const m2 = String(due).match(/(\d{1,2})\/(\d{1,2})/);
  if (m2) return new Date(new Date().getFullYear(), +m2[1]-1, +m2[2]);
  return null;
}
function isDueSoon(t, days) {
  const dt = parseDueDate(t.due);
  if (!dt) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start); end.setDate(end.getDate() + days);
  return dt >= start && dt <= end;
}
function dueClass(t) {
  if (isAsap(t)) return 'asap';
  if (isDueSoon(t, 1)) return 'hot';
  if (isDueSoon(t, 3)) return 'soon';
  return '';
}
function fmtSync(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) + ' ET';
  } catch { return iso || ''; }
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function filteredTodos() {
  const todos = mergeTodos(data).sort((a, b) => {
    if (a.status !== b.status) {
      const rank = { open: 0, waiting: 1, done: 2 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    }
    return (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9);
  });
  if (filter === 'all') return todos.filter(t => t.status !== 'done');
  return todos.filter(t => t.status === filter);
}

function cardHtml(t) {
  const dc = dueClass(t);
  return `<button type="button" class="card ${t.status}" data-id="${escapeAttr(t.id)}" data-kind="todo">
    <div class="row"><span class="id">${escapeHtml(t.id)} · ${escapeHtml(t.priority)}</span>
    <span class="due ${dc}">${escapeHtml(t.due || '—')}</span></div>
    <p class="title">${escapeHtml(t.item)}</p>
    <p class="meta">${escapeHtml(t.status)}${t.source ? ' · ' + escapeHtml(t.source) : ''}</p>
  </button>`;
}

function renderTodos() {
  const board = document.getElementById('board');
  const todos = filteredTodos();
  if (!todos.length) {
    board.innerHTML = '<p class="empty">Nothing in this view.</p>';
    return;
  }
  const used = new Set();
  let html = '';
  for (const sec of SECTION_ORDER) {
    if (filter === 'done' && sec.key !== 'done') continue;
    if (filter !== 'all' && filter !== 'done' && sec.key === 'done') continue;
    const items = todos.filter(t => sec.match(t) && !used.has(t.id));
    items.forEach(t => used.add(t.id));
    if (!items.length) continue;
    html += `<section class="section"><h2>${sec.title}<span class="count">${items.length}</span></h2>`;
    html += items.map(cardHtml).join('');
    html += '</section>';
  }
  const rest = todos.filter(t => !used.has(t.id));
  if (rest.length) {
    html += `<section class="section"><h2>Other<span class="count">${rest.length}</span></h2>${rest.map(cardHtml).join('')}</section>`;
  }
  board.innerHTML = html;
  board.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openTodo(el.dataset.id));
  });
}

function eventStart(e) {
  if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) return new Date(e.start + (e.start.length === 10 ? 'T12:00:00' : ''));
  return new Date(e.start);
}
function dayKey(e) {
  const d = eventStart(e);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}
function dayLabel(key) {
  const [y,m,day] = key.split('-').map(Number);
  const d = new Date(y, m-1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function fmtEventTime(e) {
  if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
    if (e.end && e.end !== e.start) {
      const end = new Date(e.end);
      end.setDate(end.getDate() - 1);
      const endKey = end.toLocaleDateString('en-CA');
      if (endKey !== e.start.slice(0,10)) {
        return `All day · through ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    return 'All day';
  }
  const opts = { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' };
  const a = new Date(e.start).toLocaleTimeString('en-US', opts);
  const b = new Date(e.end).toLocaleTimeString('en-US', opts);
  return `${a} – ${b} ET`;
}
function typeLabel(t) {
  return ({ outage: 'Outage', deadline: 'Deadline', work: 'Work', meeting: 'Meeting', appointment: 'Appointment' })[t] || t;
}

function filteredEvents() {
  let events = [...(data.events || [])];
  if (calFilter !== 'all') {
    events = events.filter(e => e.type === calFilter || (calFilter === 'meeting' && e.type === 'appointment'));
  }
  return events.sort((a, b) => eventStart(a) - eventStart(b));
}

function renderCalendar() {
  const root = document.getElementById('calendarView');
  const events = filteredEvents();
  if (!events.length) {
    root.innerHTML = '<p class="empty">No events in this view.</p>';
    return;
  }
  const byDay = {};
  for (const e of events) {
    const k = dayKey(e);
    (byDay[k] ||= []).push(e);
  }
  let html = '';
  for (const key of Object.keys(byDay).sort()) {
    html += `<section class="day-block"><h2>${dayLabel(key)}</h2>`;
    for (const e of byDay[key]) {
      html += `<button type="button" class="event-card ${escapeAttr(e.type)}" data-id="${escapeAttr(e.id)}" data-kind="event">
        <div class="row"><span class="badge ${escapeAttr(e.type)}">${escapeHtml(typeLabel(e.type))}</span></div>
        <p class="title">${escapeHtml(e.summary)}</p>
        <p class="event-time">${escapeHtml(fmtEventTime(e))}</p>
        ${e.location ? `<p class="event-loc">${escapeHtml(e.location)}</p>` : ''}
      </button>`;
    }
    html += '</section>';
  }
  root.innerHTML = html;
  root.querySelectorAll('.event-card').forEach(el => {
    el.addEventListener('click', () => openEvent(el.dataset.id));
  });
}

function updateMeta() {
  const all = mergeTodos(data);
  const openN = all.filter(t => t.status !== 'done').length;
  const evN = (data.events || []).length;
  if (view === 'todos') {
    document.getElementById('pageTitle').textContent = 'Onsite Todos';
    document.getElementById('syncMeta').textContent =
      `${data.owner || 'Jeff'} · ${openN} active · synced ${fmtSync(data.updated)}`;
  } else {
    document.getElementById('pageTitle').textContent = 'Calendar';
    document.getElementById('syncMeta').textContent =
      `${evN} upcoming · synced ${fmtSync(data.updated)}`;
  }
}

function setView(next) {
  view = next;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('todoFilters').hidden = view !== 'todos';
  document.getElementById('calFilters').hidden = view !== 'calendar';
  document.getElementById('board').hidden = view !== 'todos';
  document.getElementById('calendarView').hidden = view !== 'calendar';
  updateMeta();
  if (view === 'todos') renderTodos();
  else renderCalendar();
}

function openTodo(id) {
  selectedId = id; selectedKind = 'todo';
  const t = mergeTodos(data).find(x => x.id === id);
  if (!t) return;
  document.getElementById('dMeta').textContent = `${t.id} · ${t.priority} · due ${t.due || '—'}`;
  document.getElementById('dTitle').textContent = t.item;
  document.getElementById('dNotes').textContent = t.notes || 'No extra notes.';
  document.getElementById('dSource').textContent = t.source ? `Source: ${t.source}` : '';
  document.getElementById('todoActions').hidden = false;
  document.getElementById('calActions').hidden = true;
  document.getElementById('cycleStatus').textContent = nextLabel(t.status);
  document.getElementById('detail').showModal();
}
function openEvent(id) {
  selectedId = id; selectedKind = 'event';
  const e = (data.events || []).find(x => x.id === id);
  if (!e) return;
  document.getElementById('dMeta').textContent = `${typeLabel(e.type)} · ${fmtEventTime(e)}`;
  document.getElementById('dTitle').textContent = e.summary;
  document.getElementById('dNotes').textContent = e.description || 'No details.';
  document.getElementById('dSource').textContent = e.location ? `Location: ${e.location}` : '';
  document.getElementById('todoActions').hidden = true;
  document.getElementById('calActions').hidden = false;
  document.getElementById('detail').showModal();
}
function nextLabel(status) {
  if (status === 'open') return 'Mark waiting';
  if (status === 'waiting') return 'Mark done';
  return 'Reopen';
}
function nextStatus(status) {
  if (status === 'open') return 'waiting';
  if (status === 'waiting') return 'done';
  return 'open';
}

document.getElementById('cycleStatus').addEventListener('click', () => {
  const t = mergeTodos(data).find(x => x.id === selectedId);
  if (!t) return;
  const map = loadOverrides();
  map[t.id] = { status: nextStatus(t.status) };
  saveOverrides(map);
  document.getElementById('detail').close();
  renderTodos();
  updateMeta();
});

document.querySelectorAll('#todoFilters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#todoFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    renderTodos();
  });
});
document.querySelectorAll('#calFilters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#calFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    calFilter = chip.dataset.calfilter;
    renderCalendar();
  });
});
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

async function boot() {
  const res = await fetch('./todos.json', { cache: 'no-store' });
  data = await res.json();
  setView('todos');
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
  }
}
boot();
