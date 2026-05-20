/* =====================================================
   my-pm — vanilla JS, Apple Dark UI
   ===================================================== */

// ----- Supabase config -----------------------------------------------------
const SUPABASE_URL      = 'https://rpiljdyfvnpysfhwzcww.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwaWxqZHlmdm5weXNmaHd6Y3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMzk0NTIsImV4cCI6MjA5NDgxNTQ1Mn0.N_f_2ej_bfJJttFxfH3TmXfIYrkROkD282LldAO26U0';
// --------------------------------------------------------------------------

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- state ----------
const state = {
  section: 'tasks',                // 'tasks' | 'notes' | 'lists' | 'settings'
  sidebarCollapsed: false,
  auxOpen: true,

  // tasks
  projects: [],
  tasks: [],
  workBlocks: [],
  workBlockTasks: [],
  tasksView: 'today',              // 'today' | 'board' | 'all' | 'project'
  currentProjectId: null,
  tagFilter: null,
  doneFolded: {},
  focusMode: false,

  // notes — folders ARE projects, so notesProjectFilter replaces notesFolderFilter
  notes: [],
  currentNoteId: null,
  notesProjectFilter: null,
  notesSearch: '',
  notesSort: 'modified',           // 'modified' | 'created' | 'alpha'
  editorFontSize: 15,

  // lists
  lists: [],
  listItems: [],
  currentListId: null,
  listsSort: 'manual',             // 'manual' | 'priority' | 'due' | 'alpha'

  loading: true,
};

const PROJECT_COLORS = ['#007AFF','#FFD60A','#30D158','#FF6B6B','#5856D6','#06b6d4','#ec4899','#84cc16'];
const SEED_PROJECTS  = ['VendorLink','Stolen Hours/Rockea','Marketing'];
const LIST_ICONS = ['📋','✅','📚','💡','🎯','🌱','🌸','↗️','⭐','📝','🔥','🛒'];
const LIST_GRADIENTS = [
  'linear-gradient(135deg,#5856D6,#7C3AED)',
  'linear-gradient(135deg,#007AFF,#0055d4)',
  'linear-gradient(135deg,#30D158,#00916E)',
  'linear-gradient(135deg,#FFD60A,#FF9F0A)',
  'linear-gradient(135deg,#FF6B6B,#BE185D)',
  'linear-gradient(135deg,#34D399,#10B981)',
  'linear-gradient(135deg,#EC4899,#BE185D)',
  'linear-gradient(135deg,#06b6d4,#0e7490)',
];
const SEED_LISTS = [
  { name: 'Priorities',     icon: '🎯', color_gradient: 'linear-gradient(135deg,#007AFF,#0055d4)',  category: 'workspace' },
  { name: 'Reading list',   icon: '📚', color_gradient: 'linear-gradient(135deg,#5856D6,#7C3AED)',  category: 'workspace' },
  { name: 'Ideas backlog',  icon: '💡', color_gradient: 'linear-gradient(135deg,#FFD60A,#FF9F0A)',  category: 'workspace' },
  { name: 'Follow ups',     icon: '↗️', color_gradient: 'linear-gradient(135deg,#30D158,#00916E)',  category: 'workspace' },
  { name: 'Habits',         icon: '🌱', color_gradient: 'linear-gradient(135deg,#34D399,#10B981)',  category: 'personal' },
  { name: 'Gratitude',      icon: '🌸', color_gradient: 'linear-gradient(135deg,#EC4899,#BE185D)',  category: 'personal' },
];
const ITEM_TAG_COLORS = ['product','marketing','outreach','content','ops'];

// ---------- shortcuts ----------
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => 'tmp-' + Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0,10);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const wordCount = (text) => (text.trim().match(/\S+/g) || []).length;
const stripTags = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function fmtDue(d) {
  if (!d) return '';
  const t = todayISO();
  if (d === t) return 'Today';
  const diff = (new Date(d) - new Date(t)) / 86400000;
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtRelative(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function isOverdue(t) { return t.due_date && t.status !== 'done' && t.due_date < todayISO(); }
function isDueToday(t) { return t.due_date === todayISO() && t.status !== 'done'; }

// =====================================================
// DATA LAYER
// =====================================================
async function loadAll() {
  const labels = ['projects','tasks','work_blocks','work_block_tasks','notes','lists','list_items'];
  const results = await Promise.all([
    sb.from('projects').select('*').order('position', { ascending: true }),
    sb.from('tasks').select('*').order('created_at', { ascending: false }),
    sb.from('work_blocks').select('*').order('position', { ascending: true }),
    sb.from('work_block_tasks').select('*').order('position', { ascending: true }),
    sb.from('notes').select('*').order('updated_at', { ascending: false }),
    sb.from('lists').select('*').order('position', { ascending: true }),
    sb.from('list_items').select('*').order('sort_order', { ascending: true }),
  ]);

  let anyError = false;
  results.forEach((r, i) => {
    if (r.error) {
      anyError = true;
      console.error(`[loadAll] ${labels[i]} query failed:`, r.error);
    }
  });
  if (anyError) toast('Some data failed to load — see console', 'error');

  // Always commit whatever succeeded — one failing query should not blank the rest.
  state.projects       = results[0].data || [];
  state.tasks          = results[1].data || [];
  state.workBlocks     = results[2].data || [];
  state.workBlockTasks = results[3].data || [];
  state.notes          = results[4].data || [];
  state.lists          = results[5].data || [];
  state.listItems      = results[6].data || [];

  console.log(
    `[loadAll] projects=${state.projects.length} tasks=${state.tasks.length} ` +
    `blocks=${state.workBlocks.length} notes=${state.notes.length} ` +
    `lists=${state.lists.length} items=${state.listItems.length}`
  );
  const byStatus = state.tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  console.log('[loadAll] tasks by status:', byStatus);

  // Only seed when the projects/lists fetch *succeeded* and came back empty —
  // otherwise an RLS read-block would silently spawn duplicate rows.
  if (!results[0].error && !state.projects.length) {
    for (let i = 0; i < SEED_PROJECTS.length; i++) {
      await createProject(SEED_PROJECTS[i], PROJECT_COLORS[i % PROJECT_COLORS.length], i);
    }
  }
  if (!results[5].error && !state.lists.length) {
    for (let i = 0; i < SEED_LISTS.length; i++) {
      const L = SEED_LISTS[i];
      await createList(L, i);
    }
  }
  state.loading = false;
}

// ---------- projects ----------
async function refreshProjects() {
  const { data, error } = await sb.from('projects').select('*').order('position', { ascending: true });
  if (error) { console.error('[refreshProjects] failed:', error); return false; }
  state.projects = data || [];
  return true;
}

async function createProject(name, color, position) {
  const tmp = { id: uid(), name, color, position: position ?? state.projects.length, created_at: new Date().toISOString() };
  state.projects.push(tmp);
  renderSidebar();
  const { data, error } = await sb.from('projects').insert({ name, color, position: tmp.position }).select().single();
  if (error) {
    console.error('[createProject] insert failed:', error);
    toast(`Create project failed: ${error.message || error.hint || 'unknown error'}`, 'error');
    state.projects = state.projects.filter(p => p.id !== tmp.id);
    await refreshProjects();
    renderSidebar(); renderView();
    return;
  }
  // Replace optimistic placeholder with the real row, then re-sync from Supabase
  // so the sidebar always reflects what the DB actually has.
  Object.assign(tmp, data);
  await refreshProjects();
  renderSidebar(); renderView();
}
async function renameProject(id, name) {
  const p = state.projects.find(p => p.id === id); if (!p) return;
  p.name = name; renderSidebar(); renderView();
  await sb.from('projects').update({ name }).eq('id', id);
}
async function updateProjectColor(id, color) {
  const p = state.projects.find(p => p.id === id); if (!p) return;
  p.color = color; renderSidebar(); renderView();
  await sb.from('projects').update({ color }).eq('id', id);
}
async function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks = state.tasks.filter(t => t.project_id !== id);
  state.notes.forEach(n => { if (n.project_id === id) n.project_id = null; });
  state.lists.forEach(L => { if (L.project_id === id) L.project_id = null; });
  if (state.currentProjectId === id) { state.tasksView = 'today'; state.currentProjectId = null; }
  if (state.notesProjectFilter === id) state.notesProjectFilter = null;
  renderSidebar(); renderView();
  await sb.from('projects').delete().eq('id', id);
}

// ---------- tasks ----------
async function createTask(partial) {
  const tmp = {
    id: uid(),
    project_id: partial.project_id ?? state.projects[0]?.id ?? null,
    note_id: partial.note_id || null,
    title: partial.title || 'Untitled',
    description: partial.description || '',
    due_date: partial.due_date || null,
    priority: partial.priority || 'normal',
    time_estimate: Number(partial.time_estimate) || 0,
    tags: partial.tags || [],
    status: partial.status || 'todo',
    recurring: partial.recurring || 'none',
    position: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
  };
  state.tasks.unshift(tmp);
  renderView();
  const { data, error } = await sb.from('tasks').insert({
    project_id: tmp.project_id, note_id: tmp.note_id,
    title: tmp.title, description: tmp.description,
    due_date: tmp.due_date, priority: tmp.priority, time_estimate: tmp.time_estimate,
    tags: tmp.tags, status: tmp.status, recurring: tmp.recurring,
  }).select().single();
  if (error) { toast('Create task failed', 'error'); state.tasks = state.tasks.filter(t => t.id !== tmp.id); renderView(); return null; }
  Object.assign(tmp, data);
  renderView(); renderSidebar();
  return tmp;
}
async function updateTask(id, patch) {
  const t = state.tasks.find(t => t.id === id); if (!t) return;
  Object.assign(t, patch); renderView(); renderSidebar();
  const { error } = await sb.from('tasks').update(patch).eq('id', id);
  if (error) { toast('Save failed', 'error'); console.error(error); }
}
async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.workBlockTasks = state.workBlockTasks.filter(j => j.task_id !== id);
  renderView(); renderSidebar(); renderWorkBlocks();
  await sb.from('tasks').delete().eq('id', id);
}
async function completeTask(id) {
  const t = state.tasks.find(t => t.id === id); if (!t) return;
  await updateTask(id, { status: 'done', completed_at: new Date().toISOString() });
  if (t.recurring && t.recurring !== 'none') {
    const next = computeNextDue(t.due_date || todayISO(), t.recurring);
    await createTask({
      project_id: t.project_id, title: t.title, description: t.description,
      due_date: next, priority: t.priority, time_estimate: t.time_estimate,
      tags: t.tags, status: 'todo', recurring: t.recurring,
    });
    toast('Recurring task regenerated');
  }
}
function computeNextDue(from, recur) {
  const d = new Date(from + 'T00:00:00');
  if (recur === 'daily')   d.setDate(d.getDate() + 1);
  if (recur === 'weekly')  d.setDate(d.getDate() + 7);
  if (recur === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0,10);
}

// ---------- work blocks ----------
async function createWorkBlock(name) {
  const tmp = { id: uid(), name: name || 'New block', position: state.workBlocks.length, created_at: new Date().toISOString() };
  state.workBlocks.push(tmp); renderWorkBlocks();
  const { data, error } = await sb.from('work_blocks').insert({ name: tmp.name, position: tmp.position }).select().single();
  if (error) { toast('Create block failed','error'); state.workBlocks = state.workBlocks.filter(b => b.id !== tmp.id); renderWorkBlocks(); return; }
  Object.assign(tmp, data); renderWorkBlocks();
}
async function renameWorkBlock(id, name) {
  const b = state.workBlocks.find(b => b.id === id); if (!b) return;
  b.name = name;
  await sb.from('work_blocks').update({ name }).eq('id', id);
}
async function deleteWorkBlock(id) {
  state.workBlocks = state.workBlocks.filter(b => b.id !== id);
  state.workBlockTasks = state.workBlockTasks.filter(j => j.work_block_id !== id);
  renderWorkBlocks();
  await sb.from('work_blocks').delete().eq('id', id);
}
async function addTaskToBlock(blockId, taskId) {
  if (state.workBlockTasks.some(j => j.work_block_id === blockId && j.task_id === taskId)) return;
  const j = { work_block_id: blockId, task_id: taskId, position: state.workBlockTasks.filter(x => x.work_block_id === blockId).length };
  state.workBlockTasks.push(j); renderWorkBlocks();
  await sb.from('work_block_tasks').insert(j);
}
async function removeTaskFromBlock(blockId, taskId) {
  state.workBlockTasks = state.workBlockTasks.filter(j => !(j.work_block_id === blockId && j.task_id === taskId));
  renderWorkBlocks();
  await sb.from('work_block_tasks').delete().eq('work_block_id', blockId).eq('task_id', taskId);
}

// ---------- notes ----------
async function createNote(partial = {}) {
  const tmp = {
    id: uid(),
    title: partial.title || 'New note',
    body: partial.body || '',
    project_id: partial.project_id ?? state.notesProjectFilter ?? null,
    word_count: 0,
    pinned: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.notes.unshift(tmp);
  state.currentNoteId = tmp.id;
  renderView();
  const { data, error } = await sb.from('notes').insert({
    title: tmp.title, body: tmp.body, project_id: tmp.project_id,
    word_count: 0, pinned: false,
  }).select().single();
  if (error) { toast('Create note failed','error'); state.notes = state.notes.filter(n => n.id !== tmp.id); renderView(); return; }
  Object.assign(tmp, data);
  state.currentNoteId = tmp.id;
  renderView();
}
async function updateNote(id, patch, options = {}) {
  const n = state.notes.find(n => n.id === id); if (!n) return;
  patch.updated_at = new Date().toISOString();
  Object.assign(n, patch);
  if (!options.skipRender) renderView();
  const { error } = await sb.from('notes').update(patch).eq('id', id);
  if (error) { toast('Save failed', 'error'); console.error(error); }
}
async function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.currentNoteId === id) state.currentNoteId = state.notes[0]?.id || null;
  renderView();
  await sb.from('notes').delete().eq('id', id);
}

// ---------- lists ----------
async function createList(partial, position) {
  const tmp = {
    id: uid(),
    name: partial.name || 'New list',
    icon: partial.icon || '📋',
    color_gradient: partial.color_gradient || 'linear-gradient(135deg,#5856D6,#7C3AED)',
    category: partial.category || 'workspace',
    position: position ?? state.lists.length,
    created_at: new Date().toISOString(),
  };
  state.lists.push(tmp);
  state.currentListId = tmp.id;
  renderSidebar(); renderView();
  const { data, error } = await sb.from('lists').insert({
    name: tmp.name, icon: tmp.icon, color_gradient: tmp.color_gradient, category: tmp.category, position: tmp.position,
  }).select().single();
  if (error) { state.lists = state.lists.filter(L => L.id !== tmp.id); renderSidebar(); renderView(); return; }
  Object.assign(tmp, data);
  state.currentListId = tmp.id;
  renderSidebar(); renderView();
}
async function renameList(id, name) {
  const L = state.lists.find(l => l.id === id); if (!L) return;
  L.name = name; renderSidebar(); renderView();
  await sb.from('lists').update({ name }).eq('id', id);
}
async function updateList(id, patch) {
  const L = state.lists.find(l => l.id === id); if (!L) return;
  Object.assign(L, patch); renderSidebar(); renderView();
  const { error } = await sb.from('lists').update(patch).eq('id', id);
  if (error) { toast('Save failed','error'); console.error(error); }
}
async function reorderListItems(listId, orderedIds) {
  orderedIds.forEach((id, i) => {
    const it = state.listItems.find(x => x.id === id);
    if (it) it.sort_order = i;
  });
  renderView();
  await Promise.all(orderedIds.map((id, i) =>
    sb.from('list_items').update({ sort_order: i }).eq('id', id)
  ));
}
async function deleteList(id) {
  state.lists = state.lists.filter(L => L.id !== id);
  state.listItems = state.listItems.filter(it => it.list_id !== id);
  if (state.currentListId === id) state.currentListId = state.lists[0]?.id || null;
  renderSidebar(); renderView();
  await sb.from('lists').delete().eq('id', id);
}

// ---------- list items ----------
async function addListItem(listId, text, tag) {
  if (!text || !text.trim()) return;
  const tmp = {
    id: uid(),
    list_id: listId,
    text: text.trim(),
    checked: false,
    tag: tag || null,
    sort_order: state.listItems.filter(it => it.list_id === listId).length,
    due_date: null,
    created_at: new Date().toISOString(),
  };
  state.listItems.push(tmp);
  renderView();
  const { data, error } = await sb.from('list_items').insert({
    list_id: tmp.list_id, text: tmp.text, checked: false, tag: tmp.tag, sort_order: tmp.sort_order,
  }).select().single();
  if (error) { toast('Add item failed','error'); state.listItems = state.listItems.filter(it => it.id !== tmp.id); renderView(); return; }
  Object.assign(tmp, data);
  renderView();
}
async function updateListItem(id, patch) {
  const it = state.listItems.find(it => it.id === id); if (!it) return;
  Object.assign(it, patch); renderView();
  const { error } = await sb.from('list_items').update(patch).eq('id', id);
  if (error) { toast('Save failed','error'); console.error(error); }
}
async function deleteListItem(id) {
  state.listItems = state.listItems.filter(it => it.id !== id);
  renderView();
  await sb.from('list_items').delete().eq('id', id);
}

// =====================================================
// CUSTOM DROPDOWN
// =====================================================
let _ddOpenInstance = null;
function closeAllDropdowns() {
  if (_ddOpenInstance) _ddOpenInstance.close();
}
function bindDropdown(triggerEl, opts) {
  // opts: { value, options: [{value,label,icon?,danger?,sep?}], onChange(val), labelFor?(val) }
  const labelFor = opts.labelFor || ((v) => (opts.options.find(o => o.value === v) || {}).label || v);
  const labelEl = triggerEl.querySelector('.label');
  const chev = triggerEl.querySelector('.chev');
  if (labelEl) labelEl.textContent = labelFor(opts.value);
  if (!chev) {
    const c = document.createElement('span');
    c.className = 'chev';
    c.innerHTML = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 5l4 4 4-4"/></svg>';
    triggerEl.appendChild(c);
  }
  triggerEl.onclick = (e) => {
    e.stopPropagation();
    if (_ddOpenInstance && _ddOpenInstance.trigger === triggerEl) { _ddOpenInstance.close(); return; }
    closeAllDropdowns();
    openDropdownMenu(triggerEl, opts, labelFor);
  };
}
function openDropdownMenu(triggerEl, opts, labelFor) {
  const root = $('#dropdown-root');
  const menu = document.createElement('div');
  menu.className = 'dd-menu';
  const rect = triggerEl.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = rect.left + 'px';
  menu.style.minWidth = Math.max(rect.width, 160) + 'px';
  menu.innerHTML = opts.options.map(o => {
    if (o.sep) return `<div class="dd-sep"></div>`;
    return `<div class="dd-opt ${o.value === opts.value ? 'selected' : ''} ${o.danger ? 'danger' : ''}" data-v="${escapeHtml(o.value)}">
      ${o.icon ? `<span class="ic">${o.icon}</span>` : ''}
      <span>${escapeHtml(o.label)}</span>
      <span class="check">✓</span>
    </div>`;
  }).join('');
  root.appendChild(menu);
  triggerEl.classList.add('open');

  const inst = {
    trigger: triggerEl,
    menu,
    close: () => {
      menu.classList.add('closing');
      triggerEl.classList.remove('open');
      setTimeout(() => menu.remove(), 140);
      _ddOpenInstance = null;
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', escClose, true);
      window.removeEventListener('resize', resizeClose);
      window.removeEventListener('scroll', resizeClose, true);
    }
  };
  const outside = (e) => { if (!menu.contains(e.target) && !triggerEl.contains(e.target)) inst.close(); };
  const escClose = (e) => { if (e.key === 'Escape') { e.stopPropagation(); inst.close(); } };
  const resizeClose = () => inst.close();
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', escClose, true);
  window.addEventListener('resize', resizeClose);
  window.addEventListener('scroll', resizeClose, true);
  _ddOpenInstance = inst;

  menu.querySelectorAll('.dd-opt').forEach(el => {
    el.onclick = () => {
      const v = el.dataset.v;
      const labelEl = triggerEl.querySelector('.label');
      if (labelEl) labelEl.textContent = labelFor(v);
      opts.onChange(v);
      inst.close();
    };
  });
}

// Create a trigger DOM element programmatically
function makeDropdownTrigger({ value, options, onChange, labelFor, className = '', minWidth }) {
  const el = document.createElement('button');
  el.className = 'dd-trigger ' + className;
  if (minWidth) el.style.minWidth = minWidth + 'px';
  el.innerHTML = `<span class="label"></span><span class="chev"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 5l4 4 4-4"/></svg></span>`;
  bindDropdown(el, { value, options, onChange, labelFor });
  return el;
}

// =====================================================
// SIDEBAR (section-aware)
// =====================================================
function renderSidebar() {
  updateBellBadge();
  const body = $('#sidebar-body');
  body.innerHTML = '';

  if (state.section === 'tasks') {
    body.appendChild(renderTasksSidebar());
  } else if (state.section === 'notes') {
    body.appendChild(renderNotesSidebar());
  } else if (state.section === 'lists') {
    body.appendChild(renderListsSidebar());
  } else if (state.section === 'settings') {
    body.appendChild(renderSettingsSidebar());
  } else if (state.section === 'calendar') {
    body.appendChild(renderCalendarSidebar());
  }

  // active dock icon
  $$('.dock-item').forEach(d => d.classList.toggle('active', d.dataset.section === state.section));
  // aux only for tasks
  $('#app').classList.toggle('has-aux', state.section === 'tasks' && state.auxOpen);
}

function renderTasksSidebar() {
  const f = document.createDocumentFragment();

  const nav = document.createElement('div');
  nav.className = 'sidebar-section';
  nav.innerHTML = `
    <button class="nav-row" data-act="today">${ic('calendar')}<span>Today</span></button>
    <button class="nav-row" data-act="board">${ic('grid')}<span>Board</span></button>
    <button class="nav-row" data-act="all">${ic('list')}<span>All Tasks</span></button>
    <button class="nav-row" data-act="focus">${ic('focus')}<span>Focus</span></button>
  `;
  nav.querySelectorAll('.nav-row').forEach(b => {
    const a = b.dataset.act;
    if (state.tasksView === a) b.classList.add('active');
    b.onclick = () => {
      if (a === 'focus') { toggleFocus(true); return; }
      state.tasksView = a;
      state.currentProjectId = null;
      renderSidebar(); renderView();
    };
  });
  f.appendChild(nav);

  const projSec = document.createElement('div');
  projSec.className = 'sidebar-section';
  projSec.innerHTML = `
    <div class="sidebar-section-head">
      <span>Projects</span>
      <button class="icon-btn tiny" id="new-project-btn" title="New project">${ic('plus', 12)}</button>
    </div>
  `;
  state.projects.forEach(p => {
    const tasksIn = state.tasks.filter(t => t.project_id === p.id);
    const total = tasksIn.length;
    const done = tasksIn.filter(t => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const noteCount = state.notes.filter(n => n.project_id === p.id).length;
    const projectLists = state.lists.filter(L => L.project_id === p.id);
    const el = document.createElement('div');
    el.className = 'project-item' + (state.tasksView === 'project' && state.currentProjectId === p.id ? ' active' : '');
    el.innerHTML = `
      <span class="project-dot" style="background:${p.color}"></span>
      <span class="project-name">${escapeHtml(p.name)}</span>
      ${noteCount ? `<span class="project-notes-badge" title="${noteCount} note${noteCount === 1 ? '' : 's'}">${ic('note', 11)}<span>${noteCount}</span></span>` : ''}
      <span class="project-progress" title="${done}/${total}"><span style="width:${pct}%"></span></span>
    `;
    el.onclick = () => openProject(p.id);
    el.oncontextmenu = (e) => { e.preventDefault(); projectContextMenu(p); };
    projSec.appendChild(el);

    projectLists.forEach(L => {
      const sub = document.createElement('div');
      sub.className = 'project-list-item' + (state.section === 'lists' && state.currentListId === L.id ? ' active' : '');
      sub.innerHTML = `
        <span class="project-list-bullet" style="background:${L.color_gradient}">${L.icon || '📋'}</span>
        <span class="project-list-name">${escapeHtml(L.name)}</span>
      `;
      sub.onclick = (e) => {
        e.stopPropagation();
        state.section = 'lists';
        state.currentListId = L.id;
        renderSidebar(); renderView();
      };
      projSec.appendChild(sub);
    });
  });
  f.appendChild(projSec);

  const tagSet = new Set();
  state.tasks.forEach(t => (t.tags || []).forEach(tg => tagSet.add(tg)));
  if (tagSet.size) {
    const tagSec = document.createElement('div');
    tagSec.className = 'sidebar-section';
    tagSec.innerHTML = `<div class="sidebar-section-head"><span>Tags</span></div>`;
    const list = document.createElement('div');
    list.className = 'tag-list';
    Array.from(tagSet).sort().forEach(tg => {
      const el = document.createElement('span');
      el.className = 'tag-pill';
      el.textContent = '#' + tg;
      el.onclick = () => { state.tagFilter = tg; renderView(); updateTagBar(); };
      list.appendChild(el);
    });
    tagSec.appendChild(list);
    f.appendChild(tagSec);
  }

  // wrap into div
  const wrap = document.createElement('div');
  wrap.appendChild(f);
  setTimeout(() => {
    $('#new-project-btn')?.addEventListener('click', openNewProject);
  }, 0);
  return wrap;
}

function renderNotesSidebar() {
  const f = document.createDocumentFragment();
  const nav = document.createElement('div');
  nav.className = 'sidebar-section';
  nav.innerHTML = `
    <button class="nav-row ${state.notesProjectFilter === null ? 'active' : ''}" data-act="all">${ic('note')}<span>All Notes</span></button>
    <button class="nav-row ${state.notesProjectFilter === 'none' ? 'active' : ''}" data-act="none">${ic('note')}<span>No folder</span></button>
  `;
  nav.querySelector('[data-act="all"]').onclick = () => { state.notesProjectFilter = null; renderSidebar(); renderView(); };
  nav.querySelector('[data-act="none"]').onclick = () => { state.notesProjectFilter = 'none'; renderSidebar(); renderView(); };
  f.appendChild(nav);

  const sec = document.createElement('div');
  sec.className = 'sidebar-section';
  sec.innerHTML = `
    <div class="sidebar-section-head">
      <span>Folders</span>
      <button class="icon-btn tiny" id="new-project-btn-notes" title="New project (folder)">${ic('plus', 12)}</button>
    </div>
  `;
  state.projects.forEach(p => {
    const cnt = state.notes.filter(n => n.project_id === p.id).length;
    const el = document.createElement('div');
    el.className = 'folder-item' + (state.notesProjectFilter === p.id ? ' active' : '');
    el.innerHTML = `
      <span class="folder-icon" style="background:${p.color}33;color:${p.color}">📁</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</span>
      <span style="font-size:11px;color:var(--text-3)">${cnt}</span>
    `;
    el.onclick = () => { state.notesProjectFilter = p.id; renderSidebar(); renderView(); };
    el.oncontextmenu = (e) => { e.preventDefault(); projectContextMenu(p); };
    sec.appendChild(el);
  });
  f.appendChild(sec);

  const wrap = document.createElement('div');
  wrap.appendChild(f);
  setTimeout(() => {
    $('#new-project-btn-notes')?.addEventListener('click', openNewProject);
  }, 0);
  return wrap;
}

function renderListsSidebar() {
  const f = document.createDocumentFragment();
  for (const cat of ['workspace','personal']) {
    const sec = document.createElement('div');
    sec.className = 'sidebar-section';
    sec.innerHTML = `<div class="sidebar-section-head"><span>${cat === 'workspace' ? 'Workspace' : 'Personal'}</span></div>`;
    state.lists.filter(L => L.category === cat).forEach(L => {
      const count = state.listItems.filter(it => it.list_id === L.id && !it.checked).length;
      const el = document.createElement('div');
      el.className = 'list-item-row' + (state.currentListId === L.id ? ' active' : '');
      el.innerHTML = `
        <span class="list-icon" style="background:${L.color_gradient}">${L.icon || '📋'}</span>
        <span>${escapeHtml(L.name)}</span>
        ${count ? `<span class="count">${count}</span>` : ''}
      `;
      el.onclick = () => { state.currentListId = L.id; renderSidebar(); renderView(); };
      el.oncontextmenu = (e) => {
        e.preventDefault();
        confirmThenDelete(`Delete list "${L.name}"?`, () => deleteList(L.id));
      };
      sec.appendChild(el);
    });
    f.appendChild(sec);
  }
  const wrap = document.createElement('div'); wrap.appendChild(f); return wrap;
}
function renderSettingsSidebar() {
  const el = document.createElement('div');
  el.className = 'sidebar-section';
  el.innerHTML = `
    <button class="nav-row active">${ic('settings')}<span>General</span></button>
    <button class="nav-row" id="s-noti">${ic('bell')}<span>Notifications</span></button>
    <button class="nav-row" id="s-shortcuts">${ic('keyboard')}<span>Shortcuts</span></button>
  `;
  setTimeout(() => {
    el.querySelector('#s-noti').onclick = () => { Notification.requestPermission?.(); toast('Permission requested'); };
    el.querySelector('#s-shortcuts').onclick = () => openCheatsheet();
  }, 0);
  return el;
}
function renderCalendarSidebar() {
  const el = document.createElement('div'); el.className = 'sidebar-section';
  el.innerHTML = `<div class="sidebar-section-head"><span>Calendar</span></div><div style="padding:12px;color:var(--text-3);font-size:12px">Coming soon.</div>`;
  return el;
}

function updateTagBar() {
  const el = $('#active-tag');
  if (state.tagFilter) {
    el.classList.remove('hidden');
    el.innerHTML = `#${escapeHtml(state.tagFilter)} <span class="x">×</span>`;
    el.onclick = () => { state.tagFilter = null; renderView(); updateTagBar(); };
  } else {
    el.classList.add('hidden');
  }
}

// =====================================================
// VIEW DISPATCH
// =====================================================
let _lastViewKey = null;
function renderView() {
  const view = $('#view');
  const key = state.section + ':' + state.tasksView + ':' + (state.currentProjectId || '') + ':' + (state.tagFilter || '') + ':' + (state.currentNoteId || '') + ':' + (state.currentListId || '') + ':' + (state.notesProjectFilter || '');
  if (key !== _lastViewKey) {
    view.style.animation = 'none'; void view.offsetHeight; view.style.animation = '';
    _lastViewKey = key;
  }
  // adjust topbar buttons
  $('#aux-btn').classList.toggle('hidden', state.section !== 'tasks');
  $('#bell-btn').classList.toggle('hidden', state.section !== 'tasks');
  $('#quick-capture').classList.toggle('hidden', state.section !== 'tasks');

  // padding adapt for editor-style views
  view.style.padding = (state.section === 'notes' || state.section === 'lists') ? '0' : '22px 24px';

  if (state.loading) return renderLoadingSkeleton(view);

  if (state.section === 'tasks')   return renderTasksView(view);
  if (state.section === 'notes')   return renderNotesView(view);
  if (state.section === 'lists')   return renderListsView(view);
  if (state.section === 'settings')return renderSettingsView(view);
  if (state.section === 'calendar')return renderCalendarView(view);
}

function renderLoadingSkeleton(view) {
  $('#view-title').textContent = 'Loading…';
  $('#view-subtitle').textContent = '';
  view.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-skeleton">
        <div class="skel-card"></div>
        <div class="skel-card"></div>
        <div class="skel-card"></div>
        <div class="skel-card"></div>
      </div>
    </div>
  `;
}

function openProject(id) {
  state.section = 'tasks';
  state.tasksView = 'project';
  state.currentProjectId = id;
  renderSidebar(); renderView();
}
function openToday() {
  state.section = 'tasks';
  state.tasksView = 'today';
  state.currentProjectId = null;
  renderSidebar(); renderView();
}

// =====================================================
// TASKS VIEWS
// =====================================================
function renderTasksView(view) {
  if (state.tasksView === 'today')   return renderToday(view);
  if (state.tasksView === 'board')   return renderBoard(view);
  if (state.tasksView === 'all')     return renderAllTasks(view);
  if (state.tasksView === 'project') return renderKanban(view);
}

function renderToday(view) {
  $('#view-title').textContent = 'Today';
  $('#view-subtitle').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const filterTag = state.tagFilter;
  const matchTag = (t) => !filterTag || (t.tags || []).includes(filterTag);
  const overdue = state.tasks.filter(t => isOverdue(t) && matchTag(t));
  const due = state.tasks.filter(t => isDueToday(t) && matchTag(t));
  const inProg = state.tasks.filter(t => t.status === 'in_progress' && !isOverdue(t) && !isDueToday(t) && matchTag(t));

  view.innerHTML = `
    ${renderTaskSection('Overdue', overdue, true)}
    ${renderTaskSection('Due today', due)}
    ${renderTaskSection('In progress', inProg)}
  `;
  hookCards(view);
}
function renderTaskSection(title, tasks, danger = false) {
  if (!tasks.length && title !== 'Due today') return '';
  return `
    <div class="section-block">
      <div class="section-block-head">
        <h2 style="${danger && tasks.length ? 'color:var(--urgent)' : ''}">${title}</h2>
        <span class="count">${tasks.length}</span>
      </div>
      <div class="today-list">
        ${tasks.length ? tasks.map(taskCardHTML).join('') : '<div class="empty">Nothing here — enjoy.</div>'}
      </div>
    </div>
  `;
}

function renderBoard(view) {
  $('#view-title').textContent = 'Board';
  $('#view-subtitle').textContent = 'All projects';
  const all = state.tasks.filter(t => !state.tagFilter || (t.tags || []).includes(state.tagFilter));
  view.innerHTML = renderKanbanHTML(all, null);
  hookCards(view); hookDropZones(view);
}

function renderAllTasks(view) {
  $('#view-title').textContent = 'All Tasks';
  $('#view-subtitle').textContent = `${state.tasks.length} total`;
  const tasks = state.tasks
    .filter(t => !state.tagFilter || (t.tags || []).includes(state.tagFilter))
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1;
    });
  view.innerHTML = `<div class="today-list">${tasks.map(taskCardHTML).join('') || '<div class="empty">No tasks yet.</div>'}</div>`;
  hookCards(view);
}

function renderKanban(view) {
  const p = state.projects.find(p => p.id === state.currentProjectId);
  if (!p) { openToday(); return; }
  $('#view-title').textContent = p.name;
  const tasksIn = state.tasks.filter(t => t.project_id === p.id && (!state.tagFilter || (t.tags || []).includes(state.tagFilter)));
  const done = tasksIn.filter(t => t.status === 'done').length;
  $('#view-subtitle').textContent = `${done}/${tasksIn.length} done`;

  view.innerHTML = `
    <div class="project-head">
      <span class="dot" style="background:${p.color}"></span>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="progress">
        <div class="progress-meta">${done}/${tasksIn.length} done</div>
        <div class="bar"><span style="width:${tasksIn.length ? (done/tasksIn.length*100) : 0}%"></span></div>
      </div>
      <div class="actions">
        <button class="btn ghost tiny" id="edit-project">Edit</button>
        <button class="btn primary tiny" id="add-task-here">+ Task</button>
      </div>
    </div>
    ${renderKanbanHTML(tasksIn, p.id)}
  `;
  $('#add-task-here').onclick = () => openQuickCapture({ project_id: p.id });
  $('#edit-project').onclick = () => projectContextMenu(p);
  hookCards(view); hookDropZones(view);
}

function renderKanbanHTML(tasksIn, projectKey) {
  const todo = tasksIn.filter(t => t.status === 'todo');
  const inProg = tasksIn.filter(t => t.status === 'in_progress');
  const doneTasks = tasksIn.filter(t => t.status === 'done');
  const key = projectKey || 'board';
  const folded = state.doneFolded[key] !== false;
  return `
    <div class="kanban">
      <div class="col" data-status="todo">
        <div class="col-head"><span>To Do</span><span class="count">${todo.length}</span></div>
        <div class="col-body" data-dropzone="todo">${todo.map(taskCardHTML).join('') || ''}</div>
      </div>
      <div class="col" data-status="in_progress">
        <div class="col-head"><span>In Progress</span><span class="count">${inProg.length}</span></div>
        <div class="col-body" data-dropzone="in_progress">${inProg.map(taskCardHTML).join('') || ''}</div>
      </div>
      <div class="col" data-status="done">
        <div class="col-head"><span>Done</span><span class="count">${doneTasks.length}</span></div>
        <div class="col-body" data-dropzone="done">
          <div class="done-fold-head ${folded ? '' : 'open'}" data-fold-key="${key}">
            <span class="chev">▸</span> ${folded ? 'Show' : 'Hide'} ${doneTasks.length} completed
          </div>
          ${folded ? '' : doneTasks.map(taskCardHTML).join('')}
        </div>
      </div>
    </div>
  `;
}

function taskCardHTML(t) {
  const overdue = isOverdue(t);
  const dueClass = overdue ? 'overdue' : (isDueToday(t) ? 'today' : '');
  const tags = (t.tags || []).map(tg => `<span class="tag-pill" data-tag="${escapeHtml(tg)}">#${escapeHtml(tg)}</span>`).join('');
  const proj = state.projects.find(p => p.id === t.project_id);
  const showProj = (state.tasksView === 'today' || state.tasksView === 'board' || state.tasksView === 'all' || state.focusMode);
  const noteLinked = t.note_id && state.notes.some(n => n.id === t.note_id);
  return `
    <div class="task-card ${t.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}" draggable="true" data-id="${t.id}">
      <div class="task-head">
        <button class="task-check" data-action="check" title="Mark complete"></button>
        <span class="task-title" data-action="title" contenteditable="true" spellcheck="false">${escapeHtml(t.title)}</span>
        ${noteLinked ? `<button class="icon-btn tiny note-link" data-action="open-note" title="Open source note">${ic('note', 12)}</button>` : ''}
        <span class="priority-badge ${t.priority}">${labelPriority(t.priority)}</span>
        <button class="icon-btn tiny task-del" data-action="del" title="Delete task">${ic('x', 12)}</button>
      </div>
      <div class="task-meta" data-action="open">
        ${proj && showProj ? `<span style="color:${proj.color}">●</span> ${escapeHtml(proj.name)}` : ''}
        ${t.due_date ? `<span class="due ${dueClass}">${fmtDue(t.due_date)}</span>` : ''}
        ${t.time_estimate ? `<span class="est">${t.time_estimate}h</span>` : ''}
        ${t.recurring && t.recurring !== 'none' ? `<span title="Recurring ${t.recurring}">⟳ ${t.recurring}</span>` : ''}
      </div>
      ${tags ? `<div style="display:flex;gap:4px;flex-wrap:wrap" data-action="open">${tags}</div>` : ''}
    </div>
  `;
}
function labelPriority(p) { return { urgent:'Urgent', high:'High', normal:'Normal', low:'Low' }[p] || p; }

function hookCards(root) {
  $$('.task-card', root).forEach(el => {
    const id = el.dataset.id;
    el.querySelectorAll('[data-action="open"]').forEach(z => {
      z.onclick = (e) => {
        if (e.target.closest('.tag-pill')) return;
        openTaskModal(id);
      };
    });
    el.querySelector('[data-action="check"]').onclick = (e) => {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id); if (!t) return;
      if (t.status === 'done') updateTask(id, { status: 'todo', completed_at: null });
      else { el.classList.add('completing'); setTimeout(() => completeTask(id), 320); }
    };
    const titleEl = el.querySelector('[data-action="title"]');
    if (titleEl) {
      titleEl.addEventListener('click', (e) => e.stopPropagation());
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = state.tasks.find(t => t.id === id)?.title || ''; titleEl.blur(); }
      });
      titleEl.addEventListener('blur', () => {
        const newTitle = titleEl.textContent.trim();
        const t = state.tasks.find(t => t.id === id);
        if (t && newTitle && newTitle !== t.title) updateTask(id, { title: newTitle });
        else if (t && !newTitle) titleEl.textContent = t.title;
      });
    }
    el.querySelector('[data-action="del"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id);
      confirmThenDelete(`Delete "${t?.title || 'this task'}"?`, () => { deleteTask(id); toast('Deleted'); });
    });
    el.querySelector('[data-action="open-note"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id); if (!t || !t.note_id) return;
      state.section = 'notes';
      state.currentNoteId = t.note_id;
      state.notesProjectFilter = null;
      renderSidebar(); renderView();
    });
    el.querySelectorAll('.tag-pill[data-tag]').forEach(p => {
      p.onclick = (e) => { e.stopPropagation(); state.tagFilter = p.dataset.tag; renderView(); updateTagBar(); };
    });
    el.addEventListener('dragstart', (e) => {
      if (e.target.isContentEditable) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
  $$('.done-fold-head', root).forEach(h => {
    h.onclick = () => {
      const k = h.dataset.foldKey;
      const folded = state.doneFolded[k] !== false;
      state.doneFolded[k] = !folded ? true : false;
      renderView();
    };
  });
}
function hookDropZones(root) {
  $$('.col-body', root).forEach(zone => {
    const status = zone.dataset.dropzone;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const t = state.tasks.find(t => t.id === id);
      if (!t || t.status === status) return;
      if (status === 'done') completeTask(id);
      else updateTask(id, { status, completed_at: null });
      toast(`Moved to ${status === 'in_progress' ? 'In Progress' : status === 'done' ? 'Done' : 'To Do'}`);
    });
  });
}

// =====================================================
// WORK BLOCKS
// =====================================================
function renderWorkBlocks() {
  const root = $('#work-blocks');
  if (!root) return;
  root.innerHTML = '';
  if (!state.workBlocks.length) {
    root.innerHTML = '<div class="empty">No work blocks yet. Press <kbd style="background:#1c1c21;border:1px solid #333;padding:1px 5px;border-radius:3px">B</kbd></div>';
    return;
  }
  state.workBlocks.forEach(b => {
    const joined = state.workBlockTasks.filter(j => j.work_block_id === b.id);
    const tasks = joined.map(j => state.tasks.find(t => t.id === j.task_id)).filter(Boolean);
    const totalEst = tasks.reduce((s, t) => s + (Number(t.time_estimate) || 0), 0);
    const el = document.createElement('div');
    el.className = 'work-block';
    el.dataset.id = b.id;
    el.innerHTML = `
      <div class="work-block-head">
        <span class="work-block-name" contenteditable="true" spellcheck="false">${escapeHtml(b.name)}</span>
        <span class="work-block-meta">${tasks.length} · ${totalEst}h</span>
        <button class="icon-btn tiny" data-action="del" title="Delete">${ic('x', 12)}</button>
      </div>
      <div class="work-block-tasks">
        ${tasks.length ? tasks.map(t => `
          <div class="work-block-task" data-tid="${t.id}">
            <span style="color:${state.projects.find(p=>p.id===t.project_id)?.color || '#888'}">●</span>
            <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</span>
            ${t.time_estimate ? `<span style="color:var(--text-3);font-size:11px">${t.time_estimate}h</span>` : ''}
            <button class="remove" data-action="remove-task" data-tid="${t.id}" title="Return to project">${ic('x', 11)}</button>
          </div>`).join('') : '<div class="empty-drop">Drop tasks here</div>'}
      </div>
    `;
    const name = el.querySelector('.work-block-name');
    name.addEventListener('blur', () => renameWorkBlock(b.id, name.textContent.trim() || 'Untitled'));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    el.querySelector('[data-action="del"]').onclick = () =>
      confirmThenDelete(`Delete block "${b.name}"? Tasks return to their projects.`, () => deleteWorkBlock(b.id));
    el.querySelectorAll('[data-action="remove-task"]').forEach(btn => {
      btn.onclick = () => removeTaskFromBlock(b.id, btn.dataset.tid);
    });
    el.querySelectorAll('.work-block-task').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="remove-task"]')) return;
        openTaskModal(row.dataset.tid);
      });
    });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('dragover');
      const tid = e.dataTransfer.getData('text/plain');
      if (tid && state.tasks.find(t => t.id === tid)) { addTaskToBlock(b.id, tid); toast('Added to block'); }
    });
    root.appendChild(el);
  });
}

// =====================================================
// NOTES VIEW
// =====================================================
function filteredNotes() {
  const q = state.notesSearch.trim().toLowerCase();
  let notes = state.notes.slice();
  if (state.notesProjectFilter === 'none') notes = notes.filter(n => !n.project_id);
  else if (state.notesProjectFilter) notes = notes.filter(n => n.project_id === state.notesProjectFilter);
  if (q) notes = notes.filter(n => n.title.toLowerCase().includes(q) || stripTags(n.body).toLowerCase().includes(q));
  const sorter = {
    modified: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
    created:  (a, b) => (b.created_at  || '').localeCompare(a.created_at  || ''),
    alpha:    (a, b) => a.title.localeCompare(b.title),
  }[state.notesSort];
  notes.sort(sorter);
  return notes;
}
function renderNotesView(view) {
  $('#view-title').textContent = 'Notes';
  const filterLabel = state.notesProjectFilter === 'none'
    ? 'No folder'
    : state.notesProjectFilter
      ? (state.projects.find(p => p.id === state.notesProjectFilter)?.name || '')
      : 'All notes';
  $('#view-subtitle').textContent = filterLabel;

  const notes = filteredNotes();
  if (state.currentNoteId && !notes.find(n => n.id === state.currentNoteId)) {
    state.currentNoteId = null;
  }
  if (!state.currentNoteId && notes.length) state.currentNoteId = notes[0].id;

  const pinned = notes.filter(n => n.pinned);
  const recent = notes.filter(n => !n.pinned);

  view.innerHTML = `
    <div class="notes-split">
      <aside class="notes-left">
        <div class="notes-left-head">
          <span class="panel-title">Notes</span>
          <span id="notes-sort-mount"></span>
          <button class="btn yellow tiny" id="new-note-btn">+ New</button>
        </div>
        <div class="notes-search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
          <input id="notes-search" placeholder="Search notes" value="${escapeHtml(state.notesSearch)}"/>
        </div>
        <div class="notes-list">
          ${pinned.length ? `<div class="notes-list-group">Pinned</div>${pinned.map(noteRowHTML).join('')}` : ''}
          ${recent.length ? `<div class="notes-list-group">Recent</div>${recent.map(noteRowHTML).join('')}` : ''}
          ${!notes.length ? '<div class="empty" style="margin:14px 8px">No notes match.</div>' : ''}
        </div>
      </aside>
      <section class="notes-right" id="notes-right"></section>
    </div>
  `;

  // sort dropdown
  const sortMount = view.querySelector('#notes-sort-mount');
  sortMount.appendChild(makeDropdownTrigger({
    value: state.notesSort,
    options: [
      { value: 'modified', label: 'Date modified' },
      { value: 'created',  label: 'Date created' },
      { value: 'alpha',    label: 'Alphabetical' },
    ],
    onChange: (v) => { state.notesSort = v; renderView(); },
  }));

  view.querySelector('#new-note-btn').onclick = () => createNote();
  const searchEl = view.querySelector('#notes-search');
  searchEl.addEventListener('input', debounce((e) => {
    state.notesSearch = e.target.value;
    renderView();
    setTimeout(() => $('#notes-search')?.focus(), 0);
  }, 150));

  view.querySelectorAll('[data-note-row]').forEach(el => {
    el.onclick = () => { state.currentNoteId = el.dataset.noteRow; renderView(); };
  });

  renderEditor(view.querySelector('#notes-right'));
}

function noteRowHTML(n) {
  const active = state.currentNoteId === n.id ? 'active' : '';
  const preview = stripTags(n.body).slice(0, 80) || 'No content';
  return `
    <div class="note-row ${active}" data-note-row="${n.id}">
      <span class="note-title">${escapeHtml(n.title || 'Untitled')}</span>
      <span class="note-preview">${escapeHtml(preview)}</span>
      <span class="note-time">${fmtRelative(n.updated_at)}</span>
    </div>
  `;
}

function renderEditor(root) {
  const n = state.notes.find(nn => nn.id === state.currentNoteId);
  if (!n) {
    root.innerHTML = `
      <div class="notes-empty">
        <div class="big">📝</div>
        <div>Select a note or create a new one.</div>
        <button class="btn yellow tiny" id="empty-new">+ New note</button>
      </div>`;
    root.querySelector('#empty-new').onclick = () => createNote();
    return;
  }
  root.innerHTML = `
    <div class="editor-topbar">
      <div class="editor-topbar-left">
        <span id="folder-pick-mount"></span>
      </div>
      <div class="editor-topbar-right">
        <button class="icon-btn tiny" id="pin-btn" title="${n.pinned ? 'Unpin' : 'Pin'}">${n.pinned ? '★' : '☆'}</button>
        <span id="more-pick-mount"></span>
      </div>
    </div>
    <div class="editor-title-wrap">
      <input class="editor-title" id="editor-title" value="${escapeHtml(n.title)}" placeholder="Untitled"/>
    </div>
    <div class="editor-meta">
      <span>${new Date(n.created_at).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</span>
      <span id="saved-state" class="saved">Auto-saved</span>
      <span><span id="wc">${n.word_count || 0}</span> words</span>
    </div>
    <div class="editor-toolbar" id="editor-toolbar">
      <span id="heading-pick-mount"></span>
      <span class="tb-sep"></span>
      <div class="tb-size">
        <button class="tb-btn" id="size-minus" title="Smaller">−</button>
        <span class="val" id="size-val">${state.editorFontSize}</span>
        <button class="tb-btn" id="size-plus" title="Bigger">+</button>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-btn" data-cmd="bold"      title="Bold (⌘B)"><strong>B</strong></button>
      <button class="tb-btn" data-cmd="italic"    title="Italic (⌘I)"><em>I</em></button>
      <button class="tb-btn" data-cmd="underline" title="Underline (⌘U)"><u>U</u></button>
      <span class="tb-sep"></span>
      <button class="tb-btn" data-cmd="insertUnorderedList" title="Bullets">${ic('list')}</button>
      <button class="tb-btn" data-cmd="insertOrderedList"   title="Numbered">${ic('ordered')}</button>
      <button class="tb-btn" data-cmd="checkbox"            title="Checklist">${ic('check')}</button>
      <span class="tb-sep"></span>
      <button class="tb-btn" data-cmd="blockquote" title="Quote">”</button>
      <button class="tb-btn" data-cmd="code"       title="Code">&lt;/&gt;</button>
      <button class="tb-btn" data-cmd="image"      title="Insert image">${ic('image')}</button>
    </div>
    <div class="editor-body" id="editor-body" contenteditable="true" spellcheck="true" style="--editor-size:${state.editorFontSize}px"></div>
    <div class="editor-footer">
      <span><span id="wc-foot">${n.word_count || 0}</span> words</span>
      <div style="display:flex; gap:6px">
        <button class="btn ghost tiny" id="link-project">Link to project</button>
        <button class="btn primary tiny" id="create-task-from-note">Create task</button>
      </div>
    </div>
  `;

  // folder picker — folders ARE projects
  const folderOpts = [{ value: '', label: 'No folder', icon: '📁' }]
    .concat(state.projects.map(p => ({ value: p.id, label: p.name, icon: '📁' })));
  root.querySelector('#folder-pick-mount').appendChild(makeDropdownTrigger({
    value: n.project_id || '',
    options: folderOpts,
    onChange: (v) => updateNote(n.id, { project_id: v || null }),
  }));

  // heading style picker
  root.querySelector('#heading-pick-mount').appendChild(makeDropdownTrigger({
    value: 'P',
    options: [
      { value: 'P',  label: 'Body' },
      { value: 'H1', label: 'Heading 1' },
      { value: 'H2', label: 'Heading 2' },
      { value: 'H3', label: 'Heading 3' },
      { value: 'BLOCKQUOTE', label: 'Quote' },
      { value: 'PRE', label: 'Code block' },
    ],
    onChange: (v) => document.execCommand('formatBlock', false, v),
    minWidth: 120,
  }));

  // more menu
  root.querySelector('#more-pick-mount').appendChild(makeDropdownTrigger({
    value: '',
    options: [
      { value: 'export',   label: 'Export markdown' },
      { value: 'copy',     label: 'Copy all text' },
      { value: 'task',     label: 'Create task from note' },
      { sep: true },
      { value: 'delete',   label: 'Delete note', danger: true },
    ],
    onChange: (v) => {
      if (v === 'export') {
        const text = htmlToMarkdown(n.body);
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = (n.title || 'note') + '.md'; a.click();
        URL.revokeObjectURL(url);
        toast('Exported');
      } else if (v === 'copy') {
        navigator.clipboard.writeText(stripTags(n.body)); toast('Copied');
      } else if (v === 'task') {
        createTaskFromNote(n);
      } else if (v === 'delete') {
        confirmThenDelete(`Delete "${n.title}"?`, () => { deleteNote(n.id); toast('Deleted'); });
      }
    },
    labelFor: () => 'More',
  }));

  const body = root.querySelector('#editor-body');
  body.innerHTML = n.body || '';

  // title
  const titleEl = root.querySelector('#editor-title');
  const savedState = root.querySelector('#saved-state');
  const wc = root.querySelector('#wc');
  const wcFoot = root.querySelector('#wc-foot');

  const flash = (text, cls) => { savedState.textContent = text; savedState.className = cls || 'saved'; };
  const queueSave = debounce(async () => {
    const patch = {
      title: titleEl.value.trim() || 'Untitled',
      body: body.innerHTML,
      word_count: wordCount(stripTags(body.innerHTML)),
    };
    flash('Saving…', '');
    await updateNote(n.id, patch, { skipRender: true });
    flash('Auto-saved', 'saved');
  }, 800);

  titleEl.addEventListener('input', () => { flash('Saving…', ''); queueSave(); });
  body.addEventListener('input', () => {
    const c = wordCount(stripTags(body.innerHTML));
    wc.textContent = c; wcFoot.textContent = c;
    flash('Saving…', ''); queueSave();
    updateToolbarActive();
  });
  body.addEventListener('keyup', updateToolbarActive);
  body.addEventListener('click', updateToolbarActive);
  body.addEventListener('focus', updateToolbarActive);
  body.addEventListener('blur', updateToolbarActive);

  // toolbar
  root.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.dataset.cmd;
      body.focus();
      if (cmd === 'blockquote') document.execCommand('formatBlock', false, 'BLOCKQUOTE');
      else if (cmd === 'code') document.execCommand('formatBlock', false, 'PRE');
      else if (cmd === 'image') {
        const url = prompt('Image URL');
        if (url) document.execCommand('insertImage', false, url);
      } else if (cmd === 'checkbox') {
        document.execCommand('insertHTML', false, '<div>☐ </div>');
      } else {
        document.execCommand(cmd);
      }
      body.dispatchEvent(new Event('input', { bubbles: true }));
      updateToolbarActive();
    };
  });

  function updateToolbarActive() {
    root.querySelectorAll('[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (['bold','italic','underline','insertOrderedList','insertUnorderedList'].includes(cmd)) {
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch {}
      }
    });
  }

  // font size
  const sizeVal = root.querySelector('#size-val');
  const applySize = () => { body.style.setProperty('--editor-size', state.editorFontSize + 'px'); sizeVal.textContent = state.editorFontSize; };
  root.querySelector('#size-plus').onclick = () => { state.editorFontSize = Math.min(24, state.editorFontSize + 1); applySize(); };
  root.querySelector('#size-minus').onclick = () => { state.editorFontSize = Math.max(11, state.editorFontSize - 1); applySize(); };

  // pin
  root.querySelector('#pin-btn').onclick = () => updateNote(n.id, { pinned: !n.pinned });

  // footer actions
  root.querySelector('#link-project').onclick = () => openLinkProjectModal(n);
  root.querySelector('#create-task-from-note').onclick = () => createTaskFromNote(n);
}

function createTaskFromNote(n) {
  openQuickCapture({
    title: n.title,
    description: stripTags(n.body).slice(0, 200),
    project_id: n.project_id || undefined,
    note_id: n.id,
  });
}

function openLinkProjectModal(n) {
  const opts = [{ value: '', label: 'None' }].concat(state.projects.map(p => ({ value: p.id, label: p.name })));
  openConfirm({
    title: 'Link to project',
    body: `<div class="field"><label>Project</label><div id="lp-mount"></div></div>`,
    primary: 'Save',
    onMount: (m) => {
      m._val = n.project_id || '';
      m.querySelector('#lp-mount').appendChild(makeDropdownTrigger({
        value: m._val,
        options: opts,
        onChange: (v) => { m._val = v; },
      }));
    },
    onPrimary: (m) => updateNote(n.id, { project_id: m._val || null }),
  });
}

function htmlToMarkdown(html) {
  // crude but useful enough for export
  let s = html || '';
  s = s.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  s = s.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  s = s.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  s = s.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  s = s.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  s = s.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  s = s.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  s = s.replace(/<u[^>]*>(.*?)<\/u>/gi, '_$1_');
  s = s.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => '```\n' + stripTags(c) + '\n```\n');
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => '> ' + stripTags(c) + '\n');
  s = s.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

// =====================================================
// LISTS VIEW
// =====================================================
function renderListsView(view) {
  $('#view-title').textContent = 'Lists';
  $('#view-subtitle').textContent = '';

  if (!state.currentListId && state.lists.length) state.currentListId = state.lists[0].id;
  const L = state.lists.find(l => l.id === state.currentListId);

  view.innerHTML = `
    <div class="lists-split">
      <aside class="lists-left">
        <div class="lists-left-head">
          <span class="panel-title">Lists</span>
          <span id="new-list-mount"></span>
        </div>
        <div class="lists-body" id="lists-body">${renderListsLeftBody()}</div>
      </aside>
      <section class="lists-right" id="lists-right"></section>
    </div>
  `;

  // new list dropdown
  view.querySelector('#new-list-mount').appendChild(makeDropdownTrigger({
    value: '',
    options: [
      { value: 'empty',     label: 'Empty list' },
      { value: 'checklist', label: 'Checklist' },
      { value: 'reading',   label: 'Reading list' },
    ],
    onChange: (v) => {
      const presets = {
        empty:     { name: 'Untitled list',  icon: '📋', color_gradient: 'linear-gradient(135deg,#5856D6,#7C3AED)' },
        checklist: { name: 'New checklist',  icon: '✅', color_gradient: 'linear-gradient(135deg,#30D158,#00916E)' },
        reading:   { name: 'Reading list',   icon: '📚', color_gradient: 'linear-gradient(135deg,#FFD60A,#FF9F0A)' },
      };
      createList({ ...presets[v], category: 'workspace' }, state.lists.length);
      toast('List created');
    },
    labelFor: () => '+ New',
    minWidth: 90,
  }));

  // hook left rows
  view.querySelectorAll('[data-list-id]').forEach(el => {
    el.onclick = () => { state.currentListId = el.dataset.listId; renderView(); };
  });

  renderListPanel(view.querySelector('#lists-right'), L);
}

function renderListsLeftBody() {
  let html = '';
  for (const cat of ['workspace','personal']) {
    const ls = state.lists.filter(L => L.category === cat);
    if (!ls.length) continue;
    html += `<div class="lists-group-label">${cat === 'workspace' ? 'Workspace' : 'Personal'}</div>`;
    ls.forEach(L => {
      const count = state.listItems.filter(it => it.list_id === L.id && !it.checked).length;
      html += `
        <div class="list-item-row ${state.currentListId === L.id ? 'active' : ''}" data-list-id="${L.id}">
          <span class="list-icon" style="background:${L.color_gradient}">${L.icon || '📋'}</span>
          <span>${escapeHtml(L.name)}</span>
          ${count ? `<span class="count">${count}</span>` : ''}
        </div>
      `;
    });
  }
  return html;
}

function renderListPanel(root, L) {
  if (!L) {
    root.innerHTML = `<div class="notes-empty"><div class="big">📋</div><div>Create your first list.</div></div>`;
    return;
  }
  let items = state.listItems.filter(it => it.list_id === L.id);
  const sorter = {
    manual:   (a, b) => a.sort_order - b.sort_order,
    priority: (a, b) => Number(b.tag === 'product') - Number(a.tag === 'product'),
    due:      (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'),
    alpha:    (a, b) => a.text.localeCompare(b.text),
  }[state.listsSort];
  items.sort(sorter);

  root.innerHTML = `
    <div class="lists-right-head">
      <button class="icon picker-trigger" id="icon-color-btn" style="background:${L.color_gradient}" title="Change icon and color">${L.icon || '📋'}</button>
      <h2 contenteditable="true" spellcheck="false" id="list-title">${escapeHtml(L.name)}</h2>
      <div class="actions">
        <span id="list-category-mount"></span>
        <span id="list-project-mount"></span>
        <span id="list-sort-mount"></span>
        <button class="btn purple tiny" id="add-item-btn">+ Add item</button>
        <button class="btn ghost tiny" id="delete-list">Delete</button>
      </div>
    </div>
    <div class="list-items" id="list-items">
      ${items.map((it, idx) => listItemHTML(it, idx)).join('')}
      <div class="add-item-row" id="quick-add-row">
        <span class="check" style="border:1.5px solid var(--text-3);width:18px;height:18px;border-radius:50%"></span>
        <input id="quick-add-input" placeholder="Add an item — press Enter"/>
        <span id="quick-tag-mount"></span>
      </div>
    </div>
  `;

  // sort dropdown
  root.querySelector('#list-sort-mount').appendChild(makeDropdownTrigger({
    value: state.listsSort,
    options: [
      { value: 'manual',   label: 'Manual' },
      { value: 'priority', label: 'Priority' },
      { value: 'due',      label: 'Due date' },
      { value: 'alpha',    label: 'Alphabetical' },
    ],
    onChange: (v) => { state.listsSort = v; renderView(); },
  }));

  // category dropdown
  root.querySelector('#list-category-mount').appendChild(makeDropdownTrigger({
    value: L.category || 'workspace',
    options: [
      { value: 'workspace', label: 'Workspace' },
      { value: 'personal',  label: 'Personal' },
    ],
    onChange: (v) => updateList(L.id, { category: v }),
  }));

  // project link dropdown
  root.querySelector('#list-project-mount').appendChild(makeDropdownTrigger({
    value: L.project_id || '',
    options: [{ value: '', label: 'No project' }].concat(state.projects.map(p => ({ value: p.id, label: p.name }))),
    onChange: (v) => updateList(L.id, { project_id: v || null }),
    labelFor: (v) => v ? (state.projects.find(p => p.id === v)?.name || 'Project') : 'No project',
  }));

  // icon/color picker
  root.querySelector('#icon-color-btn').onclick = () => openListIconColorPicker(L);

  // title
  const titleEl = root.querySelector('#list-title');
  titleEl.addEventListener('blur', () => renameList(L.id, titleEl.textContent.trim() || 'Untitled'));
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });

  // delete
  root.querySelector('#delete-list').onclick = () =>
    confirmThenDelete(`Delete "${L.name}"? All items will be removed.`, () => { deleteList(L.id); toast('Deleted'); });

  // add item button
  root.querySelector('#add-item-btn').onclick = () => $('#quick-add-input').focus();
  const input = root.querySelector('#quick-add-input');
  let pendingTag = null;
  root.querySelector('#quick-tag-mount').appendChild(makeDropdownTrigger({
    value: '',
    options: [
      { value: '',          label: 'No tag' },
      { value: 'product',   label: 'product' },
      { value: 'marketing', label: 'marketing' },
      { value: 'outreach',  label: 'outreach' },
      { value: 'content',   label: 'content' },
      { value: 'ops',       label: 'ops' },
    ],
    onChange: (v) => { pendingTag = v || null; },
    labelFor: (v) => v ? '#' + v : 'Tag',
    minWidth: 80,
  }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.trim();
      if (text) { addListItem(L.id, text, pendingTag); toast('Item added'); }
      input.value = '';
      setTimeout(() => $('#quick-add-input')?.focus(), 50);
    }
  });

  // hook items
  const listItemsRoot = root.querySelector('#list-items');
  root.querySelectorAll('.list-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.check').onclick = (e) => {
      e.stopPropagation();
      const it = state.listItems.find(x => x.id === id); if (!it) return;
      updateListItem(id, { checked: !it.checked });
      toast(!it.checked ? 'Item checked off' : 'Unchecked');
    };
    el.querySelector('.text').addEventListener('blur', () => {
      const newText = el.querySelector('.text').textContent.trim();
      const it = state.listItems.find(x => x.id === id);
      if (it && newText && newText !== it.text) updateListItem(id, { text: newText });
    });
    el.querySelector('.text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.text').blur(); }
    });
    el.querySelector('.remove').onclick = (e) => {
      e.stopPropagation();
      confirmThenDelete('Delete this item?', () => { deleteListItem(id); toast('Deleted'); });
    };

    // drag handle for reorder (only in manual sort)
    if (state.listsSort === 'manual') {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        if (e.target.isContentEditable) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/list-item', id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('text/list-item')) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        el.classList.toggle('drop-after', after);
        el.classList.toggle('drop-before', !after);
      });
      el.addEventListener('dragleave', () => { el.classList.remove('drop-after','drop-before'); });
      el.addEventListener('drop', (e) => {
        if (!e.dataTransfer.types.includes('text/list-item')) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/list-item');
        const after = el.classList.contains('drop-after');
        el.classList.remove('drop-after','drop-before');
        if (!draggedId || draggedId === id) return;
        const currentOrder = Array.from(listItemsRoot.querySelectorAll('.list-item')).map(n => n.dataset.id);
        const fromIdx = currentOrder.indexOf(draggedId);
        let toIdx = currentOrder.indexOf(id);
        if (fromIdx < 0 || toIdx < 0) return;
        currentOrder.splice(fromIdx, 1);
        toIdx = currentOrder.indexOf(id) + (after ? 1 : 0);
        currentOrder.splice(toIdx, 0, draggedId);
        reorderListItems(L.id, currentOrder);
      });
    }
  });
}

function openListIconColorPicker(L) {
  openConfirm({
    title: 'List style',
    body: `
      <div class="field"><label>Icon</label>
        <div id="li-icons" style="display:flex;gap:6px;flex-wrap:wrap">
          ${LIST_ICONS.map(ic => `<button data-i="${escapeHtml(ic)}" class="li-i" style="width:30px;height:30px;border-radius:8px;background:var(--surface-2);border:2px solid ${ic === (L.icon || '📋') ? '#fff' : 'transparent'};font-size:16px">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Color</label>
        <div id="li-grads" style="display:flex;gap:6px;flex-wrap:wrap">
          ${LIST_GRADIENTS.map(g => `<button data-g="${escapeHtml(g)}" class="li-g" style="width:30px;height:30px;border-radius:8px;background:${g};border:2px solid ${g === L.color_gradient ? '#fff' : 'transparent'}"></button>`).join('')}
        </div>
      </div>
    `,
    primary: 'Save',
    onMount: (m) => {
      m._icon = L.icon || '📋';
      m._grad = L.color_gradient;
      m.querySelectorAll('.li-i').forEach(b => {
        b.onclick = () => {
          m.querySelectorAll('.li-i').forEach(x => x.style.border = '2px solid transparent');
          b.style.border = '2px solid #fff';
          m._icon = b.dataset.i;
        };
      });
      m.querySelectorAll('.li-g').forEach(b => {
        b.onclick = () => {
          m.querySelectorAll('.li-g').forEach(x => x.style.border = '2px solid transparent');
          b.style.border = '2px solid #fff';
          m._grad = b.dataset.g;
        };
      });
    },
    onPrimary: (m) => updateList(L.id, { icon: m._icon, color_gradient: m._grad }),
  });
}

function listItemHTML(it, idx) {
  const tagCls = ITEM_TAG_COLORS.includes(it.tag) ? it.tag : '';
  return `
    <div class="list-item ${it.checked ? 'checked' : ''}" data-id="${it.id}" style="animation-delay:${idx * 18}ms">
      <span class="check"></span>
      <span class="text" contenteditable="true" spellcheck="false">${escapeHtml(it.text)}</span>
      ${it.tag ? `<span class="item-tag ${tagCls}">${escapeHtml(it.tag)}</span>` : ''}
      ${it.due_date ? `<span class="due">${fmtDue(it.due_date)}</span>` : ''}
      <button class="remove" title="Delete">${ic('x', 12)}</button>
    </div>
  `;
}

// =====================================================
// SETTINGS / CALENDAR
// =====================================================
function renderSettingsView(view) {
  $('#view-title').textContent = 'Settings';
  $('#view-subtitle').textContent = '';
  const noti = ('Notification' in window) ? Notification.permission : 'unavailable';
  view.innerHTML = `
    <div class="settings-view">
      <div class="settings-card">
        <h3>About</h3>
        <div class="settings-row">
          <div>
            <div class="label">my-pm</div>
            <div class="desc">Personal project manager. Tasks · Notes · Lists.</div>
          </div>
          <a class="btn ghost tiny" href="https://github.com/huzzfyt-lgtm/my-pm" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
      <div class="settings-card">
        <h3>Notifications</h3>
        <div class="settings-row">
          <div>
            <div class="label">Browser notifications</div>
            <div class="desc">9am daily summary while a tab is open. Current: <strong>${noti}</strong></div>
          </div>
          <button class="btn primary tiny" id="req-noti">Request permission</button>
        </div>
      </div>
      <div class="settings-card">
        <h3>Data</h3>
        <div class="settings-row">
          <div>
            <div class="label">Reset focus / dropdown state</div>
            <div class="desc">Clears local UI preferences (sort orders etc).</div>
          </div>
          <button class="btn ghost tiny" id="reset-prefs">Reset</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="label">Reload from Supabase</div>
            <div class="desc">Refetch everything from the database.</div>
          </div>
          <button class="btn ghost tiny" id="reload-data">Reload</button>
        </div>
      </div>
    </div>
  `;
  view.querySelector('#req-noti').onclick = async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    toast('Permission updated');
    renderView();
  };
  view.querySelector('#reset-prefs').onclick = () => {
    state.notesSort = 'modified'; state.listsSort = 'manual'; state.editorFontSize = 15;
    state.doneFolded = {}; renderView(); toast('Preferences reset');
  };
  view.querySelector('#reload-data').onclick = async () => { await loadAll(); renderSidebar(); renderView(); renderWorkBlocks(); toast('Reloaded'); };
}

function renderCalendarView(view) {
  $('#view-title').textContent = 'Calendar';
  $('#view-subtitle').textContent = 'Coming soon';
  view.innerHTML = `<div class="empty" style="margin-top:30px">Calendar view is not built yet. Tasks with due dates already live in Today and Board.</div>`;
}

// =====================================================
// MODALS
// =====================================================
function openModal(html, opts = {}) {
  const root = $('#modal-root');
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${opts.className || ''}" role="dialog">${html}</div>`;
  root.appendChild(back);
  const modal = back.querySelector('.modal');
  const close = () => closeModal(back);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  if (opts.onMount) opts.onMount(modal, close);
  return { modal, close, back };
}
function closeModal(back) {
  if (!back || !back.parentNode) return;
  back.classList.add('closing');
  setTimeout(() => back.remove(), 180);
}
function closeAllModals() { $$('.modal-backdrop').forEach(closeModal); }

function openQuickCapture(preset = {}) {
  let projVal = preset.project_id ?? state.projects[0]?.id ?? '';
  let prioVal = 'normal';
  let recurVal = 'none';

  const { modal, close } = openModal(`
    <h2>New task</h2>
    <div class="field"><input class="in title" id="qc-title" placeholder="What needs doing?" autocomplete="off" value="${escapeHtml(preset.title || '')}"/></div>
    <div class="field"><label>Description</label><textarea class="in" id="qc-desc" rows="2">${escapeHtml(preset.description || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Project</label><div id="qc-proj"></div></div>
      <div class="field"><label>Priority</label><div id="qc-prio"></div></div>
    </div>
    <div class="row">
      <div class="field"><label>Due date</label><input class="in" id="qc-due" type="date"/></div>
      <div class="field"><label>Estimate (h)</label><input class="in" id="qc-est" type="number" min="0" step="0.25"/></div>
    </div>
    <div class="row">
      <div class="field"><label>Recurring</label><div id="qc-recur"></div></div>
      <div class="field"><label>Tags (space-separated)</label><input class="in" id="qc-tags" placeholder="#client #deep-work"/></div>
    </div>
    <div class="suggestions" id="qc-sugg"></div>
    <div class="actions">
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn primary" id="qc-save">Create  ⏎</button>
    </div>
  `);
  modal.querySelector('#qc-proj').appendChild(makeDropdownTrigger({
    value: projVal,
    options: state.projects.map(p => ({ value: p.id, label: p.name })),
    onChange: (v) => { projVal = v; },
  }));
  modal.querySelector('#qc-prio').appendChild(makeDropdownTrigger({
    value: prioVal,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' },
    ],
    onChange: (v) => { prioVal = v; },
  }));
  modal.querySelector('#qc-recur').appendChild(makeDropdownTrigger({
    value: recurVal,
    options: ['none','daily','weekly','monthly'].map(r => ({ value: r, label: r })),
    onChange: (v) => { recurVal = v; },
  }));

  const allTags = Array.from(new Set(state.tasks.flatMap(t => t.tags || []))).sort();
  const sugg = modal.querySelector('#qc-sugg');
  sugg.innerHTML = allTags.slice(0, 12).map(t => `<span class="tag-pill" data-t="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join('');
  sugg.querySelectorAll('.tag-pill').forEach(p => {
    p.onclick = () => {
      const inp = modal.querySelector('#qc-tags');
      const cur = inp.value.trim();
      const tg = p.dataset.t;
      if (!cur.split(/[\s,]+/).includes(tg)) inp.value = (cur ? cur + ' ' : '') + tg;
    };
  });

  const titleEl = modal.querySelector('#qc-title');
  setTimeout(() => titleEl.focus(), 30);
  modal.querySelector('[data-x]').onclick = close;
  const save = () => {
    const title = titleEl.value.trim(); if (!title) return;
    const tagsRaw = modal.querySelector('#qc-tags').value;
    const tags = tagsRaw.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
    createTask({
      title,
      project_id: projVal || null,
      priority: prioVal,
      due_date: modal.querySelector('#qc-due').value || null,
      time_estimate: Number(modal.querySelector('#qc-est').value) || 0,
      tags,
      recurring: recurVal,
      description: modal.querySelector('#qc-desc').value,
    });
    close();
    toast('Task added');
  };
  modal.querySelector('#qc-save').onclick = save;
  modal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.id === 'qc-title')) save(); });
}

function openTaskModal(id) {
  const t = state.tasks.find(t => t.id === id); if (!t) return;
  let projVal = t.project_id || '';
  let statusVal = t.status;
  let prioVal = t.priority;
  let recurVal = t.recurring;

  const { modal, close } = openModal(`
    <input class="in title" id="td-title" value="${escapeHtml(t.title)}"/>
    <div class="field" style="margin-top:10px"><label>Description</label><textarea class="in" id="td-desc" rows="3">${escapeHtml(t.description || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Project</label><div id="td-proj"></div></div>
      <div class="field"><label>Status</label><div id="td-status"></div></div>
    </div>
    <div class="row">
      <div class="field"><label>Priority</label><div id="td-prio"></div></div>
      <div class="field"><label>Recurring</label><div id="td-recur"></div></div>
    </div>
    <div class="row">
      <div class="field"><label>Due date</label><input class="in" id="td-due" type="date" value="${t.due_date || ''}"/></div>
      <div class="field"><label>Estimate (h)</label><input class="in" id="td-est" type="number" min="0" step="0.25" value="${t.time_estimate || 0}"/></div>
    </div>
    <div class="field">
      <label>Tags</label>
      <input class="in" id="td-tags" value="${(t.tags || []).map(x => '#'+x).join(' ')}"/>
    </div>
    <div class="actions">
      <button class="btn danger" id="td-del">Delete</button>
      <div style="flex:1"></div>
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn primary" id="td-save">Save</button>
    </div>
  `);
  modal.querySelector('#td-proj').appendChild(makeDropdownTrigger({
    value: projVal,
    options: [{ value: '', label: 'No project' }].concat(state.projects.map(p => ({ value: p.id, label: p.name }))),
    onChange: (v) => { projVal = v; },
  }));
  modal.querySelector('#td-status').appendChild(makeDropdownTrigger({
    value: statusVal,
    options: [{ value: 'todo', label: 'To Do' },{ value: 'in_progress', label: 'In Progress' },{ value: 'done', label: 'Done' }],
    onChange: (v) => { statusVal = v; },
  }));
  modal.querySelector('#td-prio').appendChild(makeDropdownTrigger({
    value: prioVal,
    options: ['low','normal','high','urgent'].map(p => ({ value: p, label: labelPriority(p) })),
    onChange: (v) => { prioVal = v; },
  }));
  modal.querySelector('#td-recur').appendChild(makeDropdownTrigger({
    value: recurVal,
    options: ['none','daily','weekly','monthly'].map(r => ({ value: r, label: r })),
    onChange: (v) => { recurVal = v; },
  }));

  modal.querySelector('[data-x]').onclick = close;
  modal.querySelector('#td-del').onclick = () =>
    confirmThenDelete(`Delete "${t.title}"?`, () => { deleteTask(id); close(); toast('Deleted'); });
  modal.querySelector('#td-save').onclick = async () => {
    const tagsRaw = modal.querySelector('#td-tags').value;
    const patch = {
      title: modal.querySelector('#td-title').value.trim() || 'Untitled',
      description: modal.querySelector('#td-desc').value,
      project_id: projVal || null,
      status: statusVal,
      priority: prioVal,
      recurring: recurVal,
      due_date: modal.querySelector('#td-due').value || null,
      time_estimate: Number(modal.querySelector('#td-est').value) || 0,
      tags: tagsRaw.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean),
    };
    if (patch.status === 'done' && t.status !== 'done') patch.completed_at = new Date().toISOString();
    else if (patch.status !== 'done' && t.status === 'done') patch.completed_at = null;
    await updateTask(id, patch);
    close(); toast('Saved');
  };
}

function openConfirm({ title, body, primary, secondary, onPrimary, onSecondary, secondaryDanger, onMount }) {
  const { modal, close } = openModal(`
    <h2>${escapeHtml(title)}</h2>
    <div>${body || ''}</div>
    <div class="actions">
      ${secondary ? `<button class="btn ${secondaryDanger ? 'danger' : 'ghost'} left" data-s>${escapeHtml(secondary)}</button>` : ''}
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn primary" data-p>${escapeHtml(primary || 'OK')}</button>
    </div>
  `, { className: 'confirm-modal', onMount });
  modal.querySelector('[data-x]').onclick = close;
  if (secondary) modal.querySelector('[data-s]').onclick = () => { close(); onSecondary?.(); };
  modal.querySelector('[data-p]').onclick = () => { onPrimary?.(modal); close(); };
}
function confirmThenDelete(message, fn) {
  openConfirm({ title: 'Confirm delete', body: `<p>${escapeHtml(message)}</p>`, primary: 'Delete', onPrimary: () => fn() });
}

function openNewBlock() {
  openConfirm({
    title: 'New work block',
    body: `<div class="field"><label>Name</label><input class="in" id="nb-name" placeholder="Morning Sprint"/></div>`,
    primary: 'Create',
    onMount: (m) => setTimeout(() => m.querySelector('#nb-name').focus(), 30),
    onPrimary: (m) => { createWorkBlock(m.querySelector('#nb-name').value.trim() || 'New block'); toast('Block created'); },
  });
}
function openNewProject() {
  openConfirm({
    title: 'New project',
    body: `<div class="field"><label>Name</label><input class="in" id="np-name" autocomplete="off"/></div>
           <div class="field"><label>Color</label>
             <div style="display:flex;gap:6px;flex-wrap:wrap">
               ${PROJECT_COLORS.map((c,i)=>`<button data-c="${c}" class="np-c" style="width:24px;height:24px;border-radius:6px;background:${c};border:2px solid ${i===0?'#fff':'transparent'}"></button>`).join('')}
             </div>
           </div>`,
    primary: 'Create',
    onMount: (m) => {
      setTimeout(() => m.querySelector('#np-name').focus(), 30);
      m._color = PROJECT_COLORS[0];
      m.querySelectorAll('.np-c').forEach(b => {
        b.onclick = () => {
          m.querySelectorAll('.np-c').forEach(x => x.style.border = '2px solid transparent');
          b.style.border = '2px solid #fff';
          m._color = b.dataset.c;
        };
      });
    },
    onPrimary: (m) => {
      const name = m.querySelector('#np-name').value.trim();
      if (name) { createProject(name, m._color, state.projects.length); toast('Project created'); }
    },
  });
}
function projectContextMenu(p) {
  openConfirm({
    title: 'Project actions',
    body: `<div class="field"><label>Name</label><input class="in" id="rename-in" value="${escapeHtml(p.name)}"/></div>
           <div class="field"><label>Color</label>
             <div style="display:flex;gap:6px;flex-wrap:wrap">
               ${PROJECT_COLORS.map(c => `<button data-c="${c}" class="color-swatch" style="width:22px;height:22px;border-radius:5px;background:${c};border:2px solid ${c === p.color ? '#fff' : 'transparent'}"></button>`).join('')}
             </div>
           </div>`,
    primary: 'Save',
    secondary: 'Delete',
    secondaryDanger: true,
    onPrimary: (m) => {
      const name = m.querySelector('#rename-in').value.trim();
      const sw = m.querySelector('.color-swatch[data-active]');
      const color = sw ? sw.dataset.c : p.color;
      if (name && name !== p.name) renameProject(p.id, name);
      if (color !== p.color) updateProjectColor(p.id, color);
    },
    onSecondary: () => confirmThenDelete(`Delete "${p.name}"? All tasks in this project will be removed.`, () => { deleteProject(p.id); toast('Deleted'); }),
    onMount: (m) => {
      m.querySelectorAll('.color-swatch').forEach(b => {
        b.onclick = () => {
          m.querySelectorAll('.color-swatch').forEach(x => { x.style.border = '2px solid transparent'; delete x.dataset.active; });
          b.style.border = '2px solid #fff';
          b.dataset.active = '1';
        };
      });
    },
  });
}
function openCheatsheet() {
  openConfirm({
    title: 'Keyboard shortcuts',
    body: `
      <div class="cheat-grid">
        <kbd>N</kbd><div>New task (quick capture)</div>
        <kbd>B</kbd><div>New work block</div>
        <kbd>T</kbd><div>Today view</div>
        <kbd>F</kbd><div>Focus mode</div>
        <kbd>1–5</kbd><div>Switch dock section</div>
        <kbd>?</kbd><div>This cheatsheet</div>
        <kbd>Esc</kbd><div>Close modal / exit focus</div>
        <kbd>⌘/Ctrl+Enter</kbd><div>Save in modal</div>
      </div>
    `,
    primary: 'Got it',
    onPrimary: () => {},
  });
}

// =====================================================
// FOCUS MODE
// =====================================================
function toggleFocus(on) {
  state.focusMode = on !== undefined ? on : !state.focusMode;
  $('#focus-mode').classList.toggle('hidden', !state.focusMode);
  if (state.focusMode) renderFocus();
}
function renderFocus() {
  const today = state.tasks.filter(t => (isDueToday(t) || isOverdue(t)) && t.status !== 'done');
  const blocks = state.workBlocks;
  $('#focus-content').innerHTML = `
    <h2>Today</h2>
    <div class="today-list">
      ${today.length ? today.map(taskCardHTML).join('') : '<div class="empty">Nothing due. Pick something to work on.</div>'}
    </div>
    ${blocks.length ? `<h2>Active work blocks</h2>` : ''}
    ${blocks.map(b => {
      const tasks = state.workBlockTasks.filter(j => j.work_block_id === b.id).map(j => state.tasks.find(t => t.id === j.task_id)).filter(Boolean);
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--surface)">
        <div style="font-weight:500;margin-bottom:8px">${escapeHtml(b.name)}</div>
        <div class="today-list">${tasks.length ? tasks.map(taskCardHTML).join('') : '<div class="empty">No tasks yet.</div>'}</div>
      </div>`;
    }).join('')}
  `;
  hookCards($('#focus-content'));
}

// =====================================================
// TOASTS
// =====================================================
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'error' ? ' error' : '');
  el.innerHTML = `<span class="check"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 6.5l2 2 5-5"/></svg></span><span>${escapeHtml(msg)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => {
    el.classList.add('closing');
    setTimeout(() => el.remove(), 200);
  }, 2200);
}

// =====================================================
// NOTIFICATIONS
// =====================================================
function requestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  scheduleDailyNotification();
}
function scheduleDailyNotification() {
  const next = new Date(); next.setHours(9, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  const ms = next - new Date();
  setTimeout(() => { fireDailyNotification(); setInterval(fireDailyNotification, 24 * 3600 * 1000); }, ms);
}
function fireDailyNotification() {
  const due = state.tasks.filter(t => isDueToday(t));
  const overdue = state.tasks.filter(t => isOverdue(t));
  const body = `${due.length} due today · ${overdue.length} overdue`;
  if (Notification.permission === 'granted') new Notification('my-pm — today', { body });
}
function manualBell() {
  const due = state.tasks.filter(t => isDueToday(t));
  const overdue = state.tasks.filter(t => isOverdue(t));
  openConfirm({
    title: 'Notifications',
    body: `
      <div style="font-size:13px">
        <div style="margin-bottom:8px"><strong>${overdue.length}</strong> overdue · <strong>${due.length}</strong> due today</div>
        <div class="today-list">${[...overdue, ...due].slice(0,10).map(taskCardHTML).join('') || '<div class="empty">All clear.</div>'}</div>
      </div>`,
    primary: 'Close',
    onPrimary: () => {},
    onMount: (m) => hookCards(m),
  });
}
function updateBellBadge() {
  const count = state.tasks.filter(t => isOverdue(t)).length;
  const b = $('#bell-badge');
  if (!b) return;
  if (count > 0) { b.textContent = count; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

// =====================================================
// SECTION SWITCHING
// =====================================================
function switchSection(s) {
  if (s === 'calendar') { toast('Calendar — coming soon'); return; }
  state.section = s;
  if (s === 'tasks' && !state.tasksView) state.tasksView = 'today';
  closeAllDropdowns();
  renderSidebar();
  renderView();
}

// =====================================================
// KEYBOARD
// =====================================================
function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (e.key === 'Escape') {
      if ($('.modal-backdrop')) { closeAllModals(); return; }
      if (_ddOpenInstance) { closeAllDropdowns(); return; }
      if (state.focusMode) { toggleFocus(false); return; }
    }
    if (editing) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openQuickCapture(state.currentProjectId ? { project_id: state.currentProjectId } : {}); }
    else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); openNewBlock(); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); openToday(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFocus(); }
    else if (e.key === '?') { e.preventDefault(); openCheatsheet(); }
    else if (['1','2','3','4','5'].includes(e.key)) {
      e.preventDefault();
      const order = ['tasks','notes','lists','calendar','settings'];
      switchSection(order[Number(e.key)-1]);
    }
  });
}

// =====================================================
// ICONS
// =====================================================
function ic(name, size = 16) {
  const paths = {
    plus:     '<path d="M10 4v12M4 10h12"/>',
    x:        '<path d="M6 6l8 8M14 6l-8 8"/>',
    calendar: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>',
    grid:     '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>',
    list:     '<path d="M6 5h11M6 10h11M6 15h11"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="10" r="1"/><circle cx="3" cy="15" r="1"/>',
    focus:    '<circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="2"/>',
    note:     '<path d="M5 3h10v14H5z"/><path d="M8 7h4M8 10h4M8 13h3"/>',
    settings: '<circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2"/>',
    bell:     '<path d="M5 8a5 5 0 0 1 10 0v4l1 2H4l1-2V8z"/><path d="M8 16a2 2 0 0 0 4 0"/>',
    keyboard: '<rect x="2" y="5" width="16" height="10" rx="2"/><path d="M5 9h.01M8 9h.01M11 9h.01M14 9h.01M6 12h8"/>',
    ordered:  '<path d="M9 6h8M9 10h8M9 14h8"/><path d="M3 5h2v2H3z"/><path d="M3 11h2v3H3z"/>',
    check:    '<path d="M3 6l3 3 5-5"/><rect x="13" y="2" width="4" height="4" rx="1"/><path d="M3 14l3 3 5-5"/><rect x="13" y="10" width="4" height="4" rx="1"/>',
    image:    '<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7" cy="8" r="1.4"/><path d="M3 14l4-4 4 4 3-3 3 3"/>',
  };
  return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="${size}" height="${size}">${paths[name] || ''}</svg>`;
}

// =====================================================
// BOOT
// =====================================================
function bindUI() {
  $('#sidebar-toggle').onclick = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    $('#app').classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  };
  $('#mobile-menu').onclick = () => $('#app').classList.toggle('mobile-sidebar-open');
  $('#aux-btn').onclick = () => {
    state.auxOpen = !state.auxOpen;
    $('#app').classList.toggle('has-aux', state.section === 'tasks' && state.auxOpen);
    $('#app').classList.toggle('aux-open', state.auxOpen);
  };
  $('#quick-capture').onclick = () => openQuickCapture(state.currentProjectId ? { project_id: state.currentProjectId } : {});
  $('#bell-btn').onclick = manualBell;
  $('#new-block-btn').onclick = openNewBlock;
  $('#focus-exit').onclick = () => toggleFocus(false);

  $$('.dock-item').forEach(d => {
    d.onclick = () => {
      if (d.classList.contains('disabled')) { toast('Calendar — coming soon'); return; }
      switchSection(d.dataset.section);
    };
  });
}

function tickClock() {
  setInterval(() => { if (state.section === 'tasks') { renderView(); renderSidebar(); } updateBellBadge(); }, 60_000);
}

async function init() {
  bindUI();
  bindShortcuts();
  if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
    toast('Add your Supabase keys in app.js', 'error'); return;
  }
  // Paint the loading skeleton immediately so the user sees activity
  // while the initial Supabase fetch is in flight.
  renderSidebar();
  renderView();
  await loadAll();
  renderSidebar();
  renderWorkBlocks();
  renderView();
  updateBellBadge();
  requestNotifications();
  tickClock();
  $('#app').classList.add('aux-open');
}
init();
