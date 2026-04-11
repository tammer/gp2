# Gistprism — Version 2 specification

This document describes **Gistprism v2** as a **greenfield rewrite**. A new codebase may replace v1 entirely. Requirements are derived from **v1 behavior** (see v1 repository `./../gistprism/plan.md`, `./../gistprism/README.md`, and `./../gistprism/src/`) and from **`./../gistprism/delta.md`** (multi-user product and schema).

---

## 1. Product summary

**Gistprism** is a web app that shows a user **personalized news articles** stored in **Supabase (Postgres)**. Each article has summaries and metadata; the user can **mark articles read**, **save** articles for later (v1 called this “liked”), and filter the main list by **category**. **v2** generalizes v1 (which was effectively single-tenant / open anon access) into a **real multi-user product**: **Supabase Auth**, **Row Level Security (RLS)** on all user data, and **settings pages** for **global instructions** and **sources**.

**Out of scope for the web app (v2):** the **external ingestion process** that continuously creates or updates `news_articles`. The app must assume that process exists and writes rows the signed-in user is allowed to see. The spec defines the **database shape** and **RLS** so a worker using the **service role** can insert/update safely.

---

## 2. What v1 did (behavior to preserve or evolve)

Reference implementation (v1):

- **Stack:** Vite + React + TypeScript SPA, `@supabase/supabase-js`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Main screen:** Category `<select>` populated from distinct `category` values on `news_articles`. Two **views**: **Unread** (`read = false`) and **Liked** (`liked = true`), filtered by selected category. Articles ordered by `article_date` descending, nulls last.
- **Article card:** Source chip with deterministic background color from source string; **headline** links to `url` in a new tab (`rel="noopener noreferrer"`); **article date** formatted with `toLocaleString`; **short_summary** and **full_summary** (with `white-space: pre-wrap` on full text); **Mark read** sets `read` to true (remove from unread list or update in place); **Like / Unlike** toggles `liked` (remove from liked list when unliked).
- **States:** Loading, empty, and error messaging for categories and articles; banner when Supabase env is missing.

**v2 changes:**

- **Auth required** for all app functionality that touches user data.
- **Three** main views: **Unread**, **Read**, **Saved** (rename **Liked** → **Saved**; add explicit **Read** list).
- **Schema** normalized: categories and per-user sources/instructions tables; articles keyed by `user_id` and `category_id`.
- **RLS** enforces tenant isolation (no anon-wide read/update like v1’s example policies).

---

## 3. Technical stack (recommended)

Implementers may choose an equivalent stack if requirements are met; the following matches v1 and is sufficient:

| Layer | Choice |
|--------|--------|
| UI | React 18+ or 19+, TypeScript |
| Build | Vite |
| Routing | React Router (or equivalent) for multiple pages |
| Backend | Supabase project: Postgres + Auth + auto REST/RPC from client |
| Client SDK | `@supabase/supabase-js` |
| Env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public anon key only in the browser) |

**Do not** embed the Supabase **service role** key in the web app. Ingestion workers use the service role on a secure host.

---

## 4. Authentication and session

- Use **Supabase Auth** (email + password and/or magic link and/or OAuth — product owner can enable providers in the dashboard; the app must support **session lifecycle**: sign-in, sign-out, and **session refresh**).
- **Unauthenticated** visitors: show a **sign-in** (and sign-up if desired) flow only, or a minimal landing that routes to auth — **no** queries to protected tables without a session.
- Configure **redirect URLs** in Supabase for the SPA’s origin (local and production).
- After login, `auth.uid()` is the **tenant key** for all RLS policies.

---

## 5. Data model (Postgres)

Use **UUID** primary keys (`gen_random_uuid()`), **`timestamptz`** for dates, and **`text`** for URLs and long content unless you standardize on `varchar`. Name tables in **snake_case**.

### 5.1 `public.categories`

Per-user category labels for organizing articles and UI filtering.

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` |
| `name` | `text` | NOT NULL; unique per user (enforce with `UNIQUE (user_id, name)` or case-insensitive variant) |

**Note:** `delta.md` listed “category id” twice for this table; interpret as **one** surrogate `id` plus `user_id` and **`name`**.

### 5.2 `public.news_articles`

Rows belong to one user; the **external process** inserts/updates them. The app **reads** and **updates** user-visible state (`read`, `saved`).

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` |
| `category_id` | `uuid` | NOT NULL, FK → `public.categories(id)` |
| `url` | `text` | NOT NULL |
| `headline` | `text` | NOT NULL |
| `article_date` | `timestamptz` | nullable; sort **descending**, nulls **last** |
| `source` | `text` | NOT NULL default `''` |
| `short_summary` | `text` | NOT NULL default `''` |
| `full_summary` | `text` | NOT NULL default `''` |
| `read` | `boolean` | NOT NULL default `false` — **reserved word in SQL**; quote in raw SQL (`"read"`) or use generated migration tools |
| `saved` | `boolean` | NOT NULL default `false` — replaces v1’s `liked` |
| `inserted_at` | `timestamptz` | NOT NULL default `now()` |
| `updated_at` | `timestamptz` | NOT NULL default `now()` |

**Indexes (recommended):** `(user_id, category_id, read, article_date DESC NULLS LAST)` for unread/read views; partial index or composite including `saved` for saved view, depending on query patterns.

**Optional:** trigger to maintain `updated_at` on update.

### 5.3 `public.sources`

Per-user list of feed/page sources for the **external** ingestor (app provides CRUD for the user).

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` |
| `url` | `text` | NOT NULL |
| `use_rss` | `boolean` | NOT NULL default `false` |
| `category` | `text` | As per delta (free-form label for ingest routing; not necessarily FK to `categories`) |
| `instruction` | `text` | NOT NULL default `''` — per-source instructions for summarization/ingest |

### 5.4 `public.user_instructions` (global instructions)

Delta’s **“global instructions table”**: one **instruction** string per user that guides the external pipeline (the app edits it; ingest reads it).

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | NOT NULL, UNIQUE, FK → `auth.users(id)` |
| `instruction` | `text` | NOT NULL default `''` |

**Alternative:** if you prefer no separate table, a `profiles` table with an `instruction` column is acceptable; RLS must still apply.

---

## 6. Row Level Security (RLS)

Enable **RLS** on `categories`, `news_articles`, `sources`, and `user_instructions`.

**Principle:** For `authenticated` role, **all** `select` / `insert` / `update` / `delete` (as applicable) on rows must be restricted with `auth.uid() = user_id`. **No** `anon` policies on these tables for production multi-user mode.

**`news_articles`:** Authenticated users may `select` and `update` rows where `user_id = auth.uid()`. Typically **no** client `insert`/`delete` (ingest uses **service role** bypassing RLS). If the product later allows user-created drafts, add explicit policies.

**`categories`:** User can `select` / `insert` / `update` / `delete` own rows (`user_id = auth.uid()`), **or** only `select` if categories are created solely by the worker — **choose one**:

- **Recommended for flexible UX:** client can create/rename categories when managing sources or in a future “categories” UI; worker also upserts categories by name when ingesting.
- **Minimal:** only the worker inserts categories; client read-only `select` for own `user_id`.

Document the chosen rule in migrations.

**`sources`:** Full CRUD for `user_id = auth.uid()`.

**`user_instructions`:** `select` and `upsert`/`update`/`insert` for `user_id = auth.uid()`; enforce single row per user via `UNIQUE(user_id)`.

Provide **SQL migrations** (or Supabase migration files) in the repo so the schema and policies are reproducible.

---

## 7. External ingestion process (contract)

The worker (separate codebase) **must**:

- Use the **service role** key only on a trusted server.
- When creating/updating articles, set **`user_id`** to the target account, resolve **`category_id`** (create `categories` row if your product rules allow), and populate `url`, `headline`, `article_date`, `source`, `short_summary`, `full_summary`.
- Respect **`user_instructions`** and per-source **`sources.instruction`** / `use_rss` / `category` according to your pipeline design.

The **web app** does not implement this worker; it only relies on data appearing for the signed-in user.

---

## 8. Application pages and behavior

### 8.1 Layout and navigation

- **Header:** Product title (e.g. “Gistprism”) and optional tagline consistent with v1 spirit.
- **Nav links:** **Home** (main reader), **Instructions**, **Sources**, **Sign out** (when authenticated).
- **Routing:** Distinct paths for each page (exact paths are up to you; document them in the README).

### 8.2 Main reader page (home)

**Prerequisites:** User signed in.

**Category control:** `<select>` (or equivalent) listing **`categories`** for `auth.uid()`, sorted by `name`. If none:

- Show a clear **empty state** (e.g. “No categories yet” / explain that articles appear after setup or ingest).

**View toggle (three modes):**

| Mode | Filter |
|------|--------|
| **Unread** | `read = false` |
| **Read** | `read = true` |
| **Saved** | `saved = true` |

Apply **and** filter: selected `category_id` must match. **Order:** `article_date` descending, nulls last (match v1).

**Article list:** Reuse v1 UX patterns:

- **Source chip:** deterministic color from `source` string (hash → HSL background; pick light or dark foreground for contrast — see v1 `getSourceChipColors`).
- **Headline:** `<h2>` (single `<h1>` for page title) linking to `url`, `target="_blank"`, `rel="noopener noreferrer"`.
- **Date:** `toLocaleString` or equivalent; show “No date” when null.
- **Short summary** + inline or adjacent **Mark read** (if not already read — optional placement).
- **Full summary:** `pre-wrap` when non-empty.
- **Actions:**
  - **Mark read** → `read: true`; remove from **Unread** list or refresh; **Read** view should include the article.
  - **Unmark read** (optional but useful): set `read: false` when on **Read** view.
  - **Save / Unsave** → toggle `saved`; removing save should drop the article from **Saved** view.

**Concurrency / UX:** Per-row **loading** disabled state on buttons during mutations; **global or inline error** message on failure; **loading** placeholders for category and article fetches.

**Env missing:** If `VITE_SUPABASE_*` absent, show a non-destructive banner (same idea as v1).

### 8.3 Instructions page

- Load the current user’s row from **`user_instructions`** (or create on first save).
- **Text area** (or editor) for **`instruction`**.
- **Save** performs `upsert` on `(user_id)` with `instruction` body.
- Success/error feedback.

### 8.4 Sources page

- **List** all `sources` for `auth.uid()` (table or cards): show `url`, `use_rss`, `category`, `instruction`.
- **Add:** form with fields matching the table; `insert` with `user_id` from session.
- **Edit** / **Delete:** update or delete rows scoped to the user.
- Validate URL minimally (non-empty string; optional URL format check).

---

## 9. Supabase client usage (browser)

- Create a single **Supabase client** with the anon key.
- After `signIn`, use `supabase.auth.getSession()` / `onAuthStateChange` to gate routes and attach user context.
- Queries use `.eq('user_id', session.user.id)` **in addition to** RLS (defense in depth is optional but RLS is mandatory on the server).

**Types:** Generate TypeScript types from Supabase CLI (`gen types`) or maintain hand-written interfaces matching the tables.

---

## 10. Accessibility and quality bar

- Semantic headings hierarchy (one `h1` per page).
- Buttons and toggles with clear labels; `aria-pressed` on view toggles where appropriate.
- Keyboard navigable forms and lists.
- Sufficient contrast for source chips (v1 already considers relative luminance).

---

## 11. Build, deploy, and secrets

- **Local:** `npm install`, `npm run dev`; `.env.local` from `.env.example`.
- **Production:** build static assets; host on any static host; set env vars in the hosting platform.
- **Supabase:** production project with Auth providers, redirect URLs, and RLS tested under a non-owner test account.

---

## 12. Acceptance checklist (for implementers)

- [ ] User can sign up / sign in / sign out via Supabase Auth.
- [ ] Without session, user cannot read or mutate other users’ data (verify with second test user).
- [ ] Main page: category filter + **Unread** / **Read** / **Saved** views with correct filters and sort order.
- [ ] Article actions persist: mark read, save/unsave; lists update coherently.
- [ ] Instructions page saves **global** instruction to `user_instructions`.
- [ ] Sources page: full CRUD for own sources.
- [ ] Migrations include RLS policies; README documents setup and ingest boundary.
- [ ] No service role key in client bundle.

---

## 13. File and module hints (optional structure)

Suggested layout for a fresh repo:

- `src/lib/supabase.ts` — client factory.
- `src/lib/auth.tsx` or hooks — session provider.
- `src/pages/` — `Home`, `Instructions`, `Sources`, `Auth`.
- `src/components/` — `ArticleCard`, layout, forms.
- `src/types/database.ts` — row types.
- `supabase/migrations/` — SQL for tables + RLS.

This spec is intentionally **UI-framework-agnostic** beyond React + Vite; styling may be new CSS or a component library as long as behavior and accessibility goals are met.