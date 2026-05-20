/* =====================================================
   my-pm — vanilla JS single-page app
   Talks to Supabase via @supabase/supabase-js (UMD).
   ===================================================== */

// ----- Supabase config -----------------------------------------------------
const SUPABASE_URL      = 'https://rpiljdyfvnpysfhwzcww.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MGPWOpKX2rh_3oJfjPf3Mw_5fFpmrrr';
// --------------------------------------------------------------------------

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- state ----------
const state = {
  projects: [],
  tasks: [],
  workBlocks: [],
  workBlockTasks: [],          // [{ work_block_id, task_id, position }]
  view: 'today',               // 'today' | 'project'
  currentProjectId: null,
  sidebarCollapsed: false,
  todayCollapsed: false,
  tagFilter: null,
  doneFolded: {},              // { [projectId]: bool } — done section collapsed?
  loading: true,
};

const PROJECT_COLORS = ['#6366f1','#f59e0b','#22c55e','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
const SEED_PROJECTS = ['VendorLink', 'Stolen Hours (Rockea)', 'Marketing'];

// ---------- shortcuts ----------
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const uid = () => 'tmp-' + Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0,10);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function fmtDue(d) {
  if (!d) return '';
  const today = todayISO();
  if (d === today) return 'Today';
  const diff = (new Date(d) - new Date(today)) / 86400000;
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function isOverdue(t) {
  return t.due_date && t.status !== 'done' && t.due_date < todayISO();
}
function isDueToday(t) {
  return t.due_date === todayISO() && t.status !== 'done';
}

// =====================================================
// DATA LAYER
// =====================================================
async function loadAll() {
  const [{ data: projects, error: pe }, { data: tasks, error: te }, { data: blocks, error: be }, { data: wbt, error: we }] = await Promise.all([
    sb.from('projects').select('*').order('position', { ascending: true }),
    sb.from('tasks').select('*').order('created_at', { ascending: false }),
    sb.from('work_blocks').select('*').order('position', { ascending: true }),
    sb.from('work_block_tasks').select('*').order('position', { ascending: true }),
  ]);
  if (pe || te || be || we) {
    toast('Failed to load — check Supabase keys', 'error');
    console.error(pe || te || be || we);
    return;
  }
  state.projects = projects || [];
  state.tasks    = tasks || [];
  state.workBlocks = blocks || [];
  state.workBlockTasks = wbt || [];

  if (!state.projects.length) {
    for (let i = 0; i < SEED_PROJECTS.length; i++) {
      await createProject(SEED_PROJECTS[i], PROJECT_COLORS[i % PROJECT_COLORS.length], i);
    }
  }
  state.loading = false;
}

async function createProject(name, color, position) {
  const tmp = { id: uid(), name, color, position: position ?? state.projects.length, created_at: new Date().toISOString() };
  state.projects.push(tmp);
  renderSidebar();
  const { data, error } = await sb.from('projects').insert({ name, color, position: tmp.position }).select().single();
  if (error) { toast('Create project failed', 'error'); state.projects = state.projects.filter(p => p.id !== tmp.id); renderSidebar(); return; }
  Object.assign(tmp, data);
  renderSidebar(); renderView();
}

async function renameProject(id, name) {
  const p = state.projects.find(p => p.id === id);
  if (!p) return;
  p.name = name;
  renderSidebar(); renderView();
  await sb.from('projects').update({ name }).eq('id', id);
}

async function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks = state.tasks.filter(t => t.project_id !== id);
  if (state.currentProjectId === id) { state.view = 'today'; state.currentProjectId = null; }
  renderSidebar(); renderView();
  await sb.from('projects').delete().eq('id', id);
}

async function createTask(partial) {
  const tmp = {
    id: uid(),
    project_id: partial.project_id ?? state.projects[0]?.id ?? null,
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
    project_id: tmp.project_id, title: tmp.title, description: tmp.description,
    due_date: tmp.due_date, priority: tmp.priority, time_estimate: tmp.time_estimate,
    tags: tmp.tags, status: tmp.status, recurring: tmp.recurring,
  }).select().single();
  if (error) { toast('Create task failed', 'error'); state.tasks = state.tasks.filter(t => t.id !== tmp.id); renderView(); return null; }
  Object.assign(tmp, data);
  renderView(); renderSidebar();
  return tmp;
}

async function updateTask(id, patch) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  Object.assign(t, patch);
  renderView(); renderSidebar();
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
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
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

async function createWorkBlock(name) {
  const tmp = { id: uid(), name: name || 'New block', position: state.workBlocks.length, created_at: new Date().toISOString() };
  state.workBlocks.push(tmp);
  renderWorkBlocks();
  const { data, error } = await sb.from('work_blocks').insert({ name: tmp.name, position: tmp.position }).select().single();
  if (error) { toast('Create block failed', 'error'); state.workBlocks = state.workBlocks.filter(b => b.id !== tmp.id); renderWorkBlocks(); return; }
  Object.assign(tmp, data);
  renderWorkBlocks();
}

async function renameWorkBlock(id, name) {
  const b = state.workBlocks.find(b => b.id === id);
  if (!b) return;
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
  state.workBlockTasks.push(j);
  renderWorkBlocks();
  await sb.from('work_block_tasks').insert(j);
}

async function removeTaskFromBlock(blockId, taskId) {
  state.workBlockTasks = state.workBlockTasks.filter(j => !(j.work_block_id === blockId && j.task_id === taskId));
  renderWorkBlocks();
  await sb.from('work_block_tasks').delete().eq('work_block_id', blockId).eq('task_id', taskId);
}

// =====================================================
// SIDEBAR
// =====================================================
function renderSidebar() {
  updateBellBadge();
  const list = $('#project-list');
  list.innerHTML = '';
  state.projects.forEach(p => {
    const tasksIn = state.tasks.filter(t => t.project_id === p.id);
    const total = tasksIn.length;
    const done = tasksIn.filter(t => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const el = document.createElement('div');
    el.className = 'project-item' + (state.view === 'project' && state.currentProjectId === p.id ? ' active' : '');
    el.dataset.id = p.id;
    el.innerHTML = `
      <span class="project-dot" style="background:${p.color}"></span>
      <span class="project-name">${escapeHtml(p.name)}</span>
      <span class="project-progress" title="${done}/${total} done"><span style="width:${pct}%"></span></span>
    `;
    el.onclick = () => openProject(p.id);
    el.oncontextmenu = (e) => { e.preventDefault(); projectContextMenu(p, e); };
    list.appendChild(el);
  });

  // tags
  const tagSet = new Set();
  state.tasks.forEach(t => (t.tags || []).forEach(tg => tagSet.add(tg)));
  const tagList = $('#tag-list');
  tagList.innerHTML = '';
  Array.from(tagSet).sort().forEach(tg => {
    const el = document.createElement('span');
    el.className = 'tag-pill';
    el.textContent = '#' + tg;
    el.onclick = () => { state.tagFilter = tg; renderView(); updateTagBar(); };
    tagList.appendChild(el);
  });

  // active nav item
  $$('.nav-item').forEach(el => {
    el.classList.toggle('active', state.view === 'today' && el.dataset.action === 'today');
  });
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

function projectContextMenu(p, e) {
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
    onPrimary: (modal) => {
      const name = modal.querySelector('#rename-in').value.trim();
      const sw = modal.querySelector('.color-swatch[data-active]');
      const color = sw ? sw.dataset.c : p.color;
      if (name) renameProject(p.id, name);
      if (color !== p.color) sb.from('projects').update({ color }).eq('id', p.id).then(() => { p.color = color; renderSidebar(); renderView(); });
    },
    onSecondary: () => {
      confirmThenDelete(`Delete "${p.name}"? All tasks in this project will be removed.`, () => deleteProject(p.id));
    },
    onMount: (modal) => {
      modal.querySelectorAll('.color-swatch').forEach(b => {
        b.onclick = () => {
          modal.querySelectorAll('.color-swatch').forEach(x => { x.style.border = '2px solid transparent'; delete x.dataset.active; });
          b.style.border = '2px solid #fff';
          b.dataset.active = '1';
        };
      });
    },
  });
}

// =====================================================
// VIEW DISPATCH
// =====================================================
function openProject(id) {
  state.view = 'project';
  state.currentProjectId = id;
  renderSidebar();
  renderView();
}
function openToday() {
  state.view = 'today';
  state.currentProjectId = null;
  renderSidebar();
  renderView();
}

let _lastViewKey = null;
function renderView() {
  const view = $('#view');
  const key = state.view + ':' + (state.currentProjectId || '') + ':' + (state.tagFilter || '');
  if (key !== _lastViewKey) {
    view.style.animation = 'none';
    void view.offsetHeight;
    view.style.animation = '';
    _lastViewKey = key;
  }
  if (state.view === 'today') return renderToday(view);
  if (state.view === 'project') return renderKanban(view);
}

// =====================================================
// TODAY VIEW
// =====================================================
function renderToday(view) {
  $('#view-title').textContent = 'Today';
  $('#view-subtitle').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const filterTag = state.tagFilter;
  const matchTag = (t) => !filterTag || (t.tags || []).includes(filterTag);

  const overdue = state.tasks.filter(t => isOverdue(t) && matchTag(t));
  const due = state.tasks.filter(t => isDueToday(t) && matchTag(t));
  const inProg = state.tasks.filter(t => t.status === 'in_progress' && !isOverdue(t) && !isDueToday(t) && matchTag(t));

  view.innerHTML = `
    ${section('Overdue', overdue, true)}
    ${section('Due today', due)}
    ${section('In progress', inProg)}
  `;
  hookCards(view);
}

function section(title, tasks, danger = false) {
  if (!tasks.length && title !== 'Due today') return '';
  return `
    <div class="today-section">
      <div class="today-section-head">
        <h2 style="${danger && tasks.length ? 'color:var(--urgent)' : ''}">${title}</h2>
        <span class="count">${tasks.length}</span>
      </div>
      <div class="today-list">
        ${tasks.length ? tasks.map(taskCardHTML).join('') : '<div class="empty">Nothing here — enjoy.</div>'}
      </div>
    </div>
  `;
}

// =====================================================
// KANBAN VIEW
// =====================================================
function renderKanban(view) {
  const p = state.projects.find(p => p.id === state.currentProjectId);
  if (!p) { openToday(); return; }
  $('#view-title').textContent = p.name;
  const tasksIn = state.tasks.filter(t => t.project_id === p.id && (!state.tagFilter || (t.tags || []).includes(state.tagFilter)));
  const done = tasksIn.filter(t => t.status === 'done').length;
  $('#view-subtitle').textContent = `${done}/${tasksIn.length} done`;

  const todo = tasksIn.filter(t => t.status === 'todo');
  const inProg = tasksIn.filter(t => t.status === 'in_progress');
  const doneTasks = tasksIn.filter(t => t.status === 'done');
  const folded = state.doneFolded[p.id] !== false; // default folded

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
          <div class="done-fold-head ${folded ? '' : 'open'}" id="done-fold">
            <span class="chev">▸</span> ${folded ? 'Show' : 'Hide'} ${doneTasks.length} completed
          </div>
          ${folded ? '' : doneTasks.map(taskCardHTML).join('')}
        </div>
      </div>
    </div>
  `;
  $('#add-task-here').onclick = () => openQuickCapture({ project_id: p.id });
  $('#edit-project').onclick = () => projectContextMenu(p, null);
  $('#done-fold').onclick = () => {
    state.doneFolded[p.id] = !folded ? true : false;
    renderView();
  };
  hookCards(view);
  hookDropZones(view);
}

// =====================================================
// TASK CARD
// =====================================================
function taskCardHTML(t) {
  const overdue = isOverdue(t);
  const dueClass = overdue ? 'overdue' : (isDueToday(t) ? 'today' : '');
  const tags = (t.tags || []).map(tg => `<span class="tag-pill" data-tag="${escapeHtml(tg)}">#${escapeHtml(tg)}</span>`).join('');
  const proj = state.projects.find(p => p.id === t.project_id);
  return `
    <div class="task-card ${t.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}" draggable="true" data-id="${t.id}">
      <div class="task-head">
        <button class="task-check" data-action="check" title="Mark complete"></button>
        <span class="task-title" data-action="open">${escapeHtml(t.title)}</span>
        <span class="priority-badge ${t.priority}">${labelPriority(t.priority)}</span>
      </div>
      <div class="task-meta">
        ${proj && (state.view === 'today' || state.focusMode) ? `<span style="color:${proj.color}">●</span> ${escapeHtml(proj.name)}` : ''}
        ${t.due_date ? `<span class="due ${dueClass}">${fmtDue(t.due_date)}</span>` : ''}
        ${t.time_estimate ? `<span class="est">${t.time_estimate}h</span>` : ''}
        ${t.recurring && t.recurring !== 'none' ? `<span title="Recurring ${t.recurring}">⟳ ${t.recurring}</span>` : ''}
      </div>
      ${tags ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${tags}</div>` : ''}
    </div>
  `;
}

function labelPriority(p) {
  return { urgent:'Urgent', high:'High', normal:'Normal', low:'Low' }[p] || p;
}

function hookCards(root) {
  $$('.task-card', root).forEach(el => {
    const id = el.dataset.id;
    el.querySelector('[data-action="open"]').onclick = () => openTaskModal(id);
    el.querySelector('[data-action="check"]').onclick = (e) => {
      e.stopPropagation();
      const t = state.tasks.find(t => t.id === id);
      if (!t) return;
      if (t.status === 'done') {
        updateTask(id, { status: 'todo', completed_at: null });
      } else {
        el.classList.add('completing');
        setTimeout(() => completeTask(id), 320);
      }
    };
    el.querySelectorAll('.tag-pill[data-tag]').forEach(p => {
      p.onclick = (e) => { e.stopPropagation(); state.tagFilter = p.dataset.tag; renderView(); updateTagBar(); };
    });

    // drag
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
}

function hookDropZones(root) {
  $$('.col-body', root).forEach(zone => {
    const status = zone.dataset.dropzone;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const t = state.tasks.find(t => t.id === id);
      if (!t || t.status === status) return;
      if (status === 'done') {
        completeTask(id);
      } else {
        updateTask(id, { status, completed_at: null });
      }
    });
  });
}

// =====================================================
// WORK BLOCKS
// =====================================================
function renderWorkBlocks() {
  const root = $('#work-blocks');
  root.innerHTML = '';
  if (!state.workBlocks.length) {
    root.innerHTML = '<div class="empty">No work blocks yet. Press <kbd style="background:#1c1c21;border:1px solid #333;padding:1px 5px;border-radius:3px">B</kbd> to create one.</div>';
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
        <button class="icon-btn tiny" data-action="del" title="Delete block">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="work-block-tasks">
        ${tasks.length ? tasks.map(t => `
          <div class="work-block-task" data-tid="${t.id}">
            <span style="color:${state.projects.find(p=>p.id===t.project_id)?.color || '#888'}">●</span>
            <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</span>
            ${t.time_estimate ? `<span style="color:var(--text-3);font-size:11px">${t.time_estimate}h</span>` : ''}
            <button class="remove" data-action="remove-task" data-tid="${t.id}" title="Return to project">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
        `).join('') : '<div class="empty-drop">Drop tasks here</div>'}
      </div>
    `;
    // events
    const name = el.querySelector('.work-block-name');
    name.addEventListener('blur', () => renameWorkBlock(b.id, name.textContent.trim() || 'Untitled'));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    el.querySelector('[data-action="del"]').onclick = () => {
      confirmThenDelete(`Delete block "${b.name}"? Tasks will return to their projects.`, () => deleteWorkBlock(b.id));
    };
    el.querySelectorAll('[data-action="remove-task"]').forEach(btn => {
      btn.onclick = () => removeTaskFromBlock(b.id, btn.dataset.tid);
    });
    el.querySelectorAll('.work-block-task').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="remove-task"]')) return;
        openTaskModal(row.dataset.tid);
      });
    });

    // drop target
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dragover');
      const tid = e.dataTransfer.getData('text/plain');
      if (tid && state.tasks.find(t => t.id === tid)) addTaskToBlock(b.id, tid);
    });

    root.appendChild(el);
  });
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
function closeAllModals() {
  $$('.modal-backdrop').forEach(closeModal);
}

function openQuickCapture(preset = {}) {
  const projOpts = state.projects.map(p => `<option value="${p.id}" ${preset.project_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  const { modal, close } = openModal(`
    <h2>New task</h2>
    <div class="field"><input class="in title" id="qc-title" placeholder="What needs doing?" autocomplete="off"/></div>
    <div class="row">
      <div class="field"><label>Project</label><select class="in" id="qc-project">${projOpts}</select></div>
      <div class="field"><label>Priority</label>
        <select class="in" id="qc-priority">
          <option value="low">Low</option><option value="normal" selected>Normal</option>
          <option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Due date</label><input class="in" id="qc-due" type="date"/></div>
      <div class="field"><label>Estimate (h)</label><input class="in" id="qc-est" type="number" min="0" step="0.25"/></div>
    </div>
    <div class="field"><label>Tags (space or comma separated)</label><input class="in" id="qc-tags" placeholder="#client #deep-work"/>
      <div class="suggestions" id="qc-sugg"></div>
    </div>
    <div class="actions">
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn primary" id="qc-save">Create  ⏎</button>
    </div>
  `);

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
    const title = titleEl.value.trim();
    if (!title) return;
    const tagsRaw = modal.querySelector('#qc-tags').value;
    const tags = tagsRaw.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
    createTask({
      title,
      project_id: modal.querySelector('#qc-project').value || null,
      priority: modal.querySelector('#qc-priority').value,
      due_date: modal.querySelector('#qc-due').value || null,
      time_estimate: Number(modal.querySelector('#qc-est').value) || 0,
      tags,
    });
    close();
    toast('Task created');
  };
  modal.querySelector('#qc-save').onclick = save;
  modal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.id === 'qc-title')) save(); });
}

function openTaskModal(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  const projOpts = state.projects.map(p => `<option value="${p.id}" ${t.project_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

  const { modal, close } = openModal(`
    <input class="in title" id="td-title" value="${escapeHtml(t.title)}"/>
    <div class="field" style="margin-top:10px"><label>Description</label><textarea class="in" id="td-desc" rows="3">${escapeHtml(t.description || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Project</label><select class="in" id="td-project">${projOpts}</select></div>
      <div class="field"><label>Status</label>
        <select class="in" id="td-status">
          <option value="todo" ${t.status==='todo'?'selected':''}>To Do</option>
          <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="done" ${t.status==='done'?'selected':''}>Done</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Priority</label>
        <select class="in" id="td-priority">
          ${['low','normal','high','urgent'].map(p => `<option value="${p}" ${t.priority===p?'selected':''}>${labelPriority(p)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Recurring</label>
        <select class="in" id="td-recur">
          ${['none','daily','weekly','monthly'].map(r => `<option value="${r}" ${t.recurring===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Due date</label><input class="in" id="td-due" type="date" value="${t.due_date || ''}"/></div>
      <div class="field"><label>Estimate (h)</label><input class="in" id="td-est" type="number" min="0" step="0.25" value="${t.time_estimate || 0}"/></div>
    </div>
    <div class="field">
      <label>Tags</label>
      <input class="in" id="td-tags" value="${(t.tags || []).map(x => '#'+x).join(' ')}" />
    </div>
    <div class="actions">
      <button class="btn danger" id="td-del">Delete</button>
      <div style="flex:1"></div>
      <button class="btn ghost" data-x>Cancel</button>
      <button class="btn primary" id="td-save">Save</button>
    </div>
  `);

  modal.querySelector('[data-x]').onclick = close;
  modal.querySelector('#td-del').onclick = () => {
    confirmThenDelete(`Delete "${t.title}"?`, () => { deleteTask(id); close(); });
  };
  modal.querySelector('#td-save').onclick = async () => {
    const tagsRaw = modal.querySelector('#td-tags').value;
    const patch = {
      title: modal.querySelector('#td-title').value.trim() || 'Untitled',
      description: modal.querySelector('#td-desc').value,
      project_id: modal.querySelector('#td-project').value || null,
      status: modal.querySelector('#td-status').value,
      priority: modal.querySelector('#td-priority').value,
      recurring: modal.querySelector('#td-recur').value,
      due_date: modal.querySelector('#td-due').value || null,
      time_estimate: Number(modal.querySelector('#td-est').value) || 0,
      tags: tagsRaw.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean),
    };
    if (patch.status === 'done' && t.status !== 'done') {
      patch.completed_at = new Date().toISOString();
    } else if (patch.status !== 'done' && t.status === 'done') {
      patch.completed_at = null;
    }
    await updateTask(id, patch);
    close();
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
  openConfirm({
    title: 'Confirm delete',
    body: `<p>${escapeHtml(message)}</p>`,
    primary: 'Delete',
    onPrimary: () => fn(),
  });
}

function openNewBlock() {
  openConfirm({
    title: 'New work block',
    body: `<div class="field"><label>Name</label><input class="in" id="nb-name" placeholder="Morning Sprint" autocomplete="off"/></div>`,
    primary: 'Create',
    onMount: (m) => setTimeout(() => m.querySelector('#nb-name').focus(), 30),
    onPrimary: (m) => {
      const name = m.querySelector('#nb-name').value.trim() || 'New block';
      createWorkBlock(name);
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
        <kbd>?</kbd><div>This cheatsheet</div>
        <kbd>Esc</kbd><div>Close any modal / exit focus</div>
        <kbd>⌘/Ctrl + Enter</kbd><div>Save in modal</div>
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
  const el = $('#focus-mode');
  el.classList.toggle('hidden', !state.focusMode);
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
      return `
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--surface)">
          <div style="font-weight:500;margin-bottom:8px">${escapeHtml(b.name)}</div>
          <div class="today-list">${tasks.length ? tasks.map(taskCardHTML).join('') : '<div class="empty">No tasks yet.</div>'}</div>
        </div>
      `;
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
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => {
    el.classList.add('closing');
    setTimeout(() => el.remove(), 200);
  }, 2400);
}

// =====================================================
// NOTIFICATIONS
// =====================================================
function requestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  scheduleDailyNotification();
}

function scheduleDailyNotification() {
  // Fire at next 9am local
  const next = new Date();
  next.setHours(9, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  const ms = next - new Date();
  setTimeout(() => {
    fireDailyNotification();
    setInterval(fireDailyNotification, 24 * 3600 * 1000);
  }, ms);
}

function fireDailyNotification() {
  const due = state.tasks.filter(t => isDueToday(t));
  const overdue = state.tasks.filter(t => isOverdue(t));
  const body = `${due.length} due today · ${overdue.length} overdue`;
  if (Notification.permission === 'granted') {
    new Notification('my-pm — today', { body });
  }
}

function manualBell() {
  const due = state.tasks.filter(t => isDueToday(t));
  const overdue = state.tasks.filter(t => isOverdue(t));
  openConfirm({
    title: 'Notifications',
    body: `
      <div style="font-size:13px">
        <div style="margin-bottom:8px"><strong>${overdue.length}</strong> overdue · <strong>${due.length}</strong> due today</div>
        <div class="today-list">
          ${[...overdue, ...due].slice(0,10).map(taskCardHTML).join('') || '<div class="empty">All clear.</div>'}
        </div>
      </div>
    `,
    primary: 'Close',
    onPrimary: () => {},
    onMount: (m) => hookCards(m),
  });
}

function updateBellBadge() {
  const count = state.tasks.filter(t => isOverdue(t)).length;
  const b = $('#bell-badge');
  if (count > 0) { b.textContent = count; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
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
      if (state.focusMode) { toggleFocus(false); return; }
    }
    if (editing) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openQuickCapture(state.currentProjectId ? { project_id: state.currentProjectId } : {}); }
    else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); openNewBlock(); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); openToday(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFocus(); }
    else if (e.key === '?') { e.preventDefault(); openCheatsheet(); }
  });
}

// =====================================================
// MAIN BOOTSTRAP
// =====================================================
function bindUI() {
  $('#sidebar-toggle').onclick = () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    $('#app').classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  };
  $('#mobile-menu').onclick = () => { $('#app').classList.toggle('mobile-sidebar-open'); };
  $('#today-panel-btn').onclick = () => {
    state.todayCollapsed = !state.todayCollapsed;
    $('#app').classList.toggle('today-collapsed', state.todayCollapsed);
  };

  $$('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.action === 'today') openToday();
      else if (el.dataset.action === 'focus') toggleFocus(true);
      else if (el.dataset.action === 'cheatsheet') openCheatsheet();
    });
  });

  $('#new-project-btn').onclick = () => {
    openConfirm({
      title: 'New project',
      body: `<div class="field"><label>Name</label><input class="in" id="np-name" autocomplete="off"/></div>
             <div class="field"><label>Color</label>
               <div style="display:flex;gap:6px;flex-wrap:wrap">
                 ${PROJECT_COLORS.map((c,i) => `<button data-c="${c}" class="np-c" style="width:24px;height:24px;border-radius:5px;background:${c};border:2px solid ${i===0?'#fff':'transparent'}"></button>`).join('')}
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
        if (name) createProject(name, m._color, state.projects.length);
      },
    });
  };

  $('#quick-capture').onclick = () => openQuickCapture(state.currentProjectId ? { project_id: state.currentProjectId } : {});
  $('#bell-btn').onclick = manualBell;
  $('#new-block-btn').onclick = openNewBlock;
  $('#focus-exit').onclick = () => toggleFocus(false);
}

function tickClock() {
  // refresh overdue states once a minute
  setInterval(() => { renderView(); renderSidebar(); updateBellBadge(); }, 60_000);
}

async function init() {
  bindUI();
  bindShortcuts();
  if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
    toast('Add your Supabase keys in app.js', 'error');
    return;
  }
  await loadAll();
  renderSidebar();
  renderWorkBlocks();
  renderView();
  updateBellBadge();
  requestNotifications();
  tickClock();
}

init();
