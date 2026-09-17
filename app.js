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
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let data = null;
let filter = 'all';
let calFilter = 'all';
let calMode = 'month'; // month | list
let view = 'todos';
let selectedId = null;
let calMonth = null;
let selectedDayKey = null;

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
function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

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
  if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
    const s = e.start.slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(e.start);
}
function eventEndExclusive(e) {
  if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(String(e.start))) {
    const end = (e.end || e.start).slice(0, 10);
    const [y, m, d] = end.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const end = new Date(e.end || e.start);
  return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
}
function eventCoversDay(e, key) {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const start = new Date(eventStart(e).getFullYear(), eventStart(e).getMonth(), eventStart(e).getDate());
  const endEx = eventEndExclusive(e);
  return day >= start && day < endEx;
}
function dayKeyFromEvent(e) {
  const d = eventStart(e);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}
function filteredEvents() {
  let events = [...(data.events || [])];
  if (calFilter !== 'all') {
    events = events.filter(e => e.type === calFilter || (calFilter === 'meeting' && e.type === 'appointment'));
  }
  return events;
}
function eventsOnDay(key) {
  return filteredEvents().filter(e => eventCoversDay(e, key))
    .sort((a, b) => eventStart(a) - eventStart(b));
}
function typesOnDay(key) {
  const types = [];
  for (const e of eventsOnDay(key)) {
    if (!types.includes(e.type)) types.push(e.type);
  }
  return types.slice(0, 4);
}
function fmtEventTime(e) {
  if (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
    if (e.end && e.end.slice(0, 10) !== e.start.slice(0, 10)) {
      const end = new Date(e.end.slice(0, 10) + 'T12:00:00');
      end.setDate(end.getDate() - 1);
      return `All day · through ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
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
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function eventCardHtml(e) {
  return `<button type="button" class="event-card ${escapeAttr(e.type)}" data-id="${escapeAttr(e.id)}" data-kind="event">
    <div class="row"><span class="badge ${escapeAttr(e.type)}">${escapeHtml(typeLabel(e.type))}</span></div>
    <p class="title">${escapeHtml(e.summary)}</p>
    <p class="event-time">${escapeHtml(fmtEventTime(e))}</p>
    ${e.location ? `<p class="event-loc">${escapeHtml(e.location)}</p>` : ''}
  </button>`;
}

function renderListCalendar() {
  const events = filteredEvents().sort((a, b) => eventStart(a) - eventStart(b));
  if (!events.length) return '<p class="empty">No events in this view.</p>';
  const byDay = {};
  for (const e of events) {
    // multi-day: list under start day for list view
    const k = dayKeyFromEvent(e);
    (byDay[k] ||= []).push(e);
  }
  let html = '';
  for (const key of Object.keys(byDay).sort()) {
    html += `<section class="day-block"><h2>${dayLabel(key)}</h2>`;
    html += byDay[key].map(eventCardHtml).join('');
    html += '</section>';
  }
  return html;
}

function dayCell(key, num, outside, today) {
  const types = typesOnDay(key);
  const cls = [
    'cal-day',
    outside ? 'outside' : '',
    key === today ? 'today' : '',
    key === selectedDayKey ? 'selected' : '',
    types.length ? 'has-events' : '',
  ].filter(Boolean).join(' ');
  const dots = types.map(t => `<i class="cal-dot ${escapeAttr(t)}"></i>`).join('');
  return `<button type="button" class="${cls}" data-day="${escapeAttr(key)}" aria-label="${escapeAttr(key)}">
    <span class="cal-day-num">${num}</span>
    <span class="cal-dots">${dots}</span>
  </button>`;
}

function renderMonthCalendar() {
  if (!calMonth) {
    const t = todayKey().split('-').map(Number);
    calMonth = new Date(t[0], t[1] - 1, 1);
  }
  if (!selectedDayKey) selectedDayKey = todayKey();

  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const monthTitle = calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();
  const today = todayKey();

  let cells = '';
  for (let i = 0; i < firstDow; i++) {
    const d = prevDays - firstDow + 1 + i;
    const key = ymd(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, d);
    cells += dayCell(key, d, true, today);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells += dayCell(ymd(y, m, d), d, false, today);
  }
  const total = firstDow + daysInMonth;
  const trail = (7 - (total % 7)) % 7;
  for (let i = 1; i <= trail; i++) {
    const key = ymd(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, i);
    cells += dayCell(key, i, true, today);
  }

  const dayEvents = eventsOnDay(selectedDayKey);
  let agenda = `<div class="day-agenda"><h3>${dayLabel(selectedDayKey)}</h3>`;
  if (!dayEvents.length) agenda += '<p class="empty" style="padding:12px 0">No events this day.</p>';
  else agenda += dayEvents.map(eventCardHtml).join('');
  agenda += '</div>';

  return `
    <div class="cal-toolbar">
      <button type="button" class="cal-nav-btn" id="calPrev" aria-label="Previous month">‹</button>
      <h2>${monthTitle}</h2>
      <button type="button" class="cal-nav-btn" id="calNext" aria-label="Next month">›</button>
    </div>
    <div class="cal-legend">
      <span><i class="cal-dot outage"></i> Outage</span>
      <span><i class="cal-dot meeting"></i> Meeting</span>
      <span><i class="cal-dot work"></i> Work</span>
      <span><i class="cal-dot deadline"></i> Deadline</span>
    </div>
    <div class="cal-grid" role="grid" aria-label="${monthTitle}">
      ${DOW.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    ${agenda}
  `;
}

function renderCalendar() {
  const root = document.getElementById('calendarView');
  const modeBar = `
    <div class="filters mode-row" role="tablist" aria-label="Calendar layout">
      <button type="button" class="chip ${calMode === 'month' ? 'active' : ''}" data-calmode="month">Month</button>
      <button type="button" class="chip ${calMode === 'list' ? 'active' : ''}" data-calmode="list">List</button>
    </div>`;
  root.innerHTML = modeBar + (calMode === 'month' ? renderMonthCalendar() : renderListCalendar());

  root.querySelectorAll('[data-calmode]').forEach(chip => {
    chip.addEventListener('click', () => {
      calMode = chip.dataset.calmode;
      renderCalendar();
    });
  });

  if (calMode === 'month') {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    document.getElementById('calPrev').onclick = () => {
      calMonth = new Date(y, m - 1, 1);
      renderCalendar();
    };
    document.getElementById('calNext').onclick = () => {
      calMonth = new Date(y, m + 1, 1);
      renderCalendar();
    };
    root.querySelectorAll('.cal-day').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDayKey = btn.dataset.day;
        const [sy, sm] = selectedDayKey.split('-').map(Number);
        if (sy !== y || sm - 1 !== m) calMonth = new Date(sy, sm - 1, 1);
        renderCalendar();
      });
    });
  }

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
  selectedId = id;
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
  selectedId = id;
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
  const t = todayKey().split('-').map(Number);
  calMonth = new Date(t[0], t[1] - 1, 1);
  selectedDayKey = todayKey();
  setView('todos');
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
  }
}
boot();
