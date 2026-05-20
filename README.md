# my-pm

Personal project manager with three sections — **Tasks**, **Notes**, **Lists** — plus a Settings page. Apple-dark UI, dock navigation, vanilla HTML/CSS/JS, Supabase-backed, deployed to Vercel.

No login, no auth — open to anyone with the URL.

Live: https://my-pm-roan.vercel.app

---

## 1. Set up Supabase

1. Create a project at https://supabase.com (or use an existing one).
2. Open the **SQL Editor** → **New query**.
3. Paste the entire contents of `schema.sql` and run it. This creates eight tables (`projects`, `tasks`, `work_blocks`, `work_block_tasks`, `note_folders`, `notes`, `lists`, `list_items`) with indexes and permissive RLS policies.
   - The schema is **safe to re-run** — every table uses `if not exists`.
4. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** (or **publishable**) key

## 2. Wire the keys

Open `app.js` and replace the two constants at the top:

```js
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

## 3. Run locally

```sh
python3 -m http.server 5174 --bind 127.0.0.1
```

Then open `http://127.0.0.1:5174`.

## 4. Deploy to Vercel

Push to GitHub and import in the Vercel dashboard, or:

```sh
npx vercel --prod
```

Every push to `main` auto-deploys.

---

## Sections

### Tasks (dock 1)

- Projects with progress bars (auto-seeded on first load: VendorLink, Stolen Hours (Rockea), Marketing).
- Kanban board with drag-and-drop between **To Do / In Progress / Done**.
- **Today** (overdue + due-today + in-progress), **Board** (all-projects kanban), **All Tasks** (flat sorted list), per-project Kanban.
- Work blocks panel on the right — drag any task into a block, removing returns it to its project.
- Quick capture: floating **+** or **N**.
- Tags freeform, auto-suggested, click any pill to filter across the app.
- Recurring tasks regenerate on completion (daily / weekly / monthly).
- Overdue tasks pulse red.
- 9am daily browser notifications + manual bell with overdue count.

### Notes (dock 2)

- Two-panel layout: list left, rich text editor right.
- Folders (auto-seeded: VendorLink, Stolen Hours/Rockea, Ideas).
- Pinned + Recent grouping in the list.
- Live search filtering by title and body.
- Sort: Date modified / Date created / Alphabetical.
- Editor:
  - Title + auto-save indicator + live word count
  - Heading style dropdown (Body / H1–H3 / Quote / Code block)
  - Font size +/- (11–24px)
  - Bold, Italic, Underline, Lists, Checklists, Quote, Code, Image
  - Folder picker, More menu (Export Markdown / Copy / Create task / Link to project / Delete)
- Auto-saves to Supabase 800ms after the last keystroke.

### Lists (dock 3)

- Two-panel: directory left, items right.
- Grouped by **Workspace** and **Personal** (seeded with Priorities / Reading list / Ideas backlog / Follow ups / Habits / Gratitude).
- Inline item editing, purple gradient checkbox with spring animation.
- Tag pills per item (product / marketing / outreach / content / ops).
- Quick add at the bottom: type + Enter, optional tag from a dropdown.
- Sort: Manual / Priority / Due date / Alphabetical.

### Calendar (dock 4) — *Coming soon*

Stubbed for now; clicking shows a toast.

### Settings (dock 5)

- About + GitHub link.
- Browser notification permission request.
- Reset local UI preferences.
- Hard-reload everything from Supabase.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `N` | New task (quick capture) |
| `B` | New work block |
| `T` | Today view |
| `F` | Focus mode |
| `1`–`5` | Switch dock section (Tasks / Notes / Lists / Calendar / Settings) |
| `?` | Cheatsheet |
| `Esc` | Close modal / close dropdown / exit focus |
| `⌘/Ctrl + Enter` | Save in modal |

## Schema

Eight tables. All have permissive `anon all` RLS policies — the URL is the password.

```
projects(id, name, color, position, created_at)
tasks(id, project_id, title, description, due_date, priority, time_estimate,
      tags, status, recurring, position, completed_at, created_at)
work_blocks(id, name, position, created_at)
work_block_tasks(work_block_id, task_id, position, created_at)

note_folders(id, name, color, icon, position, created_at)
notes(id, title, body, folder_id, project_id, word_count, pinned,
      created_at, updated_at)

lists(id, name, icon, color_gradient, category, position, created_at)
list_items(id, list_id, text, checked, tag, sort_order, due_date, created_at)
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell (sidebar / topbar / aux panel / dock / modal + toast roots) |
| `style.css` | Apple-dark theme, dock, custom dropdowns, two-panel layouts, animations |
| `app.js` | Section switching, custom dropdowns, Supabase queries, all rendering, drag-drop, shortcuts |
| `schema.sql` | Idempotent schema for all eight tables + indexes + RLS |
| `vercel.json` | Static deploy config |

## Notes

- All writes are optimistic — UI updates immediately, then syncs.
- Daily 9am notifications only fire while a tab is open. For true background pushes you'd need a Service Worker + Web Push setup.
- The "open to whoever has the URL" model means treat the URL like a password.
