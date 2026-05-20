# my-pm

A personal project manager: projects, tasks, a kanban board, work blocks, a Today view, drag-and-drop, keyboard shortcuts, focus mode, and 9am push notifications. Linear-inspired dark UI. Vanilla HTML / CSS / JS. Supabase for persistence. Vercel for hosting.

No login, no auth — open to anyone with the URL.

---

## 1. Set up Supabase

1. Create a project at https://supabase.com (or use an existing one).
2. Open the **SQL Editor** → **New query**.
3. Paste the entire contents of `schema.sql` and run it. This creates four tables (`projects`, `tasks`, `work_blocks`, `work_block_tasks`) with indexes and permissive RLS policies for anon access.
4. In **Project Settings → API**, copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon public** key

## 2. Wire the keys

Open `app.js` and replace the two placeholders at the top:

```js
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

The keys are public-by-design — this app has no auth and your RLS policies allow anon access. If that's not OK for you, add a single shared password (e.g. localStorage gate) or move to authenticated RLS.

## 3. Run locally

It's static — any HTTP server works:

```sh
# Python
python3 -m http.server 5173

# or Node
npx serve .
```

Open `http://localhost:5173`.

On first load the app seeds three projects: **VendorLink**, **Stolen Hours (Rockea)**, and **Marketing**.

## 4. Deploy to Vercel

```sh
npx vercel --prod
```

Or push to GitHub and import in the Vercel dashboard. `vercel.json` is already configured for a static deploy.

---

## Features

- **Projects** — create, rename, delete, color-coded with a progress bar.
- **Tasks** — title, description, due date, priority (urgent / high / normal / low), time estimate, tags, status, recurring (daily / weekly / monthly).
- **Kanban** — drag tasks between **To Do**, **In Progress**, **Done**. Status updates write through to Supabase.
- **Work blocks** — drag any task into a named block (e.g. "Morning Sprint"). Removing a task returns it to its project; deleting a block returns all of its tasks.
- **Today view** — overdue + due-today + in-progress, default landing screen.
- **Quick capture** — floating **+** button or **N**. Modal with project picker, priority, due date, tags.
- **Tags** — freeform, auto-suggested from existing tags. Click a tag pill anywhere to filter across all projects.
- **Focus mode** — full-screen view of today's work, **F** to toggle.
- **Notifications** — browser push permission requested on load; a 9am summary fires daily. Bell icon shows overdue badge and manual trigger.
- **Recurring** — when marked done, a new instance is generated for the next interval.
- **Confirm-before-delete** for every destructive action.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `N` | New task (quick capture) |
| `B` | New work block |
| `T` | Today view |
| `F` | Focus mode |
| `?` | Cheatsheet |
| `Esc` | Close modal / exit focus |
| `⌘/Ctrl + Enter` | Save in modal |

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `style.css` | All styling (Linear-inspired dark theme) |
| `app.js` | App logic, Supabase calls, rendering, DnD, shortcuts |
| `schema.sql` | Run once in the Supabase SQL editor |
| `vercel.json` | Static hosting config |

## Notes

- Writes are optimistic — UI updates immediately, then syncs to Supabase. If the network call fails you'll see a toast and the change is rolled back where possible.
- The "open to whoever has the URL" model means anyone who finds your URL can read and write. Treat the URL like a password, or add auth later.
- Daily 9am notifications only fire while a tab is open. For real background pushes you'd need a Service Worker + Web Push setup — not included here to keep the deploy zero-config.
