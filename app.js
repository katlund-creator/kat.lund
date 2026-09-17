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
let selectedId = null;

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
  if (m2) {
    const y = new Date().getFullYear();
    return new Date(y, +m2[1]-1, +m2[2]);
  }
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
    const d = new Date(iso);
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  } catch { return iso || ''; }
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

function renderCal() {
  const strip = document.getElementById('calStrip');
  const list = document.getElementById('calList');
  const items = data.calendar || [];
  if (!items.length) { strip.hidden = true; return; }
  strip.hidden = false;
  list.innerHTML = items.slice(0, 8).map(c => `<li>${escapeHtml(c.replace(/^\*\*/, '').replace(/\*\*/g, ''))}</li>`).join('');
}

function render() {
  document.getElementById('syncMeta').textContent =
    `${data.owner || 'Jeff'} · synced ${fmtSync(data.updated)}`;
  renderCal();
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
    for (const t of items) {
      html += cardHtml(t);
    }
    html += '</section>';
  }
  // leftovers
  const rest = todos.filter(t => !used.has(t.id));
  if (rest.length) {
    html += `<section class="section"><h2>Other<span class="count">${rest.length}</span></h2>`;
    html += rest.map(cardHtml).join('');
    html += '</section>';
  }
  board.innerHTML = html;
  board.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

function cardHtml(t) {
  const dc = dueClass(t);
  return `<button type="button" class="card ${t.status}" data-id="${escapeAttr(t.id)}">
    <div class="row"><span class="id">${escapeHtml(t.id)} · ${escapeHtml(t.priority)}</span>
    <span class="due ${dc}">${escapeHtml(t.due || '—')}</span></div>
    <p class="title">${escapeHtml(t.item)}</p>
    <p class="meta">${escapeHtml(t.status)}${t.source ? ' · ' + escapeHtml(t.source) : ''}</p>
  </button>`;
}

function openDetail(id) {
  selectedId = id;
  const t = mergeTodos(data).find(x => x.id === id);
  if (!t) return;
  document.getElementById('dMeta').textContent = `${t.id} · ${t.priority} · due ${t.due || '—'}`;
  document.getElementById('dTitle').textContent = t.item;
  document.getElementById('dNotes').textContent = t.notes || 'No extra notes.';
  document.getElementById('dSource').textContent = t.source ? `Source: ${t.source}` : '';
  const btn = document.getElementById('cycleStatus');
  btn.textContent = nextLabel(t.status);
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
  render();
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    render();
  });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, ''); }

async function boot() {
  const res = await fetch('./todos.json', { cache: 'no-store' });
  data = await res.json();
  render();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
  }
}
boot();
