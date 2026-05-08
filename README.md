# Gistprism v2

Web app for personalized news articles backed by **Supabase** (Postgres + Auth + Row Level Security). See [spec.md](spec.md) for full product requirements.
(Touch)

## Stack

- Vite, React 19, TypeScript
- React Router
- `@supabase/supabase-js` (anon key only in the browser)

## Local setup

1. **Create a Supabase project** (or use an empty database you control).

2. **Apply schema once** — open the SQL Editor and run the entire contents of [database/schema.sql](database/schema.sql). This creates tables, indexes, the `updated_at` trigger, and RLS policies. There is no migration pipeline; re-run or adjust manually if you change the schema later.

3. **Authentication** — in the Supabase dashboard, enable Email (or other providers) and add your app URLs under **Authentication → URL configuration** (e.g. `http://localhost:5173` for Vite dev).

4. **Environment** — copy `.env.example` to `.env.local` and set:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (project **anon** public key only; never the service role)
   - `VITE_API_BASE_URL` — canonical backend base URL for **Add source** (resolve) and pipeline APIs (see [`resolve_api.md`](resolve_api.md)); e.g. `http://127.0.0.1:5000` locally or your deployed host with **no trailing slash**. Optional: set `VITE_RESOLVE_API_BASE_URL` and/or `VITE_PIPELINE_API_BASE_URL` to override per service.

5. Install and run:

   ```bash
   npm install
   npm run dev
   ```

6. **First use** — sign up or sign in, add at least one **category** in **Settings** (or rely on your ingestor to create categories), then articles ingested for your `user_id` will appear when present.

## Routes

| Path | Page |
|------|------|
| `/` | Reader (categories, Unread / Read / Saved) |
| `/settings` | Categories (instructions per category), sources, exclusions |
| `/instructions`, `/sources` | Redirect to `/settings` |
| `/auth` | Sign in / sign up |

Unauthenticated users are redirected to `/auth` for app pages that need a session.

## Ingestion (out of scope for this repo)

A separate worker using the **service role** key on a trusted host should insert/update `news_articles` (and optionally `categories`) per user. The SPA never embeds the service role key. See spec §7 in [spec.md](spec.md).

## Build

```bash
npm run build
```

Static output is in `dist/` and can be deployed to any static host with the same env vars.

## Acceptance checklist

See [spec.md](spec.md) §12 — verify RLS with two test accounts, confirm list filters and article actions, and confirm the service role key is not in the client bundle.
