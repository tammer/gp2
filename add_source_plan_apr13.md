# Spec: Add source via resolve API (Apr 13)

## References

- **Resolve endpoint contract:** [`resolve_api.md`](resolve_api.md) — `POST /api/sources/resolve`, auth, request/response shape, `ok` / `error` codes, HTTP statuses.
- **Persistence:** [`server_changes.md`](server_changes.md) — `sources` has `url`, `use_rss`, `category_id` (no per-source `instruction`).

The resolve service is **read-only**. The SPA obtains `resolved_url` and `use_rss` from the API, then **inserts** the row in Supabase with the authenticated user’s session (same pattern as today’s direct “add source” insert).

## Goal

On **Settings**, adding a source under a category should:

1. Start from a **hint** (partial URL, hostname, or site name — same semantics as API `query`).
2. Call the resolve API with the user’s **Supabase access JWT** as `Authorization: Bearer …`.
3. Show a **review** step with fields prefilled from the response; user **confirms** (or can adjust — see below) before insert.
4. Insert into **`sources`** with `url = resolved_url`, `use_rss` from API, `category_id` = **the category block’s id**, `user_id` = `auth.uid()`.

## UX (Settings page)

### Placement

- **Per category:** Keep the list of existing sources for that category.
- **Below that list:** Primary control **Add source** (not an always-visible inline URL form). Clicking it opens a **modal** (same dialog pattern as **Add category**).

### Modal flow

1. **Step A — Query**  
   - Single field: **URL or site name** (maps to JSON `query`).  
   - Actions: **Resolve** (or **Continue**), **Cancel**.  
   - Show loading state while the request is in flight.

2. **Step B — Review / confirm**  
   - Prefill from a successful `ok: true` response (see [`resolve_api.md`](resolve_api.md)):
     - **`resolved_url`** → editable **URL** field (this is what will be stored in `sources.url`).
     - **`use_rss`** → **Use RSS** checkbox (must stay consistent with stored semantics: `true` iff the stored URL is the feed URL).
   - Optionally show read-only context to build trust: **`website_title`**, **`confidence`**, **`notes`** (recommended; helps when `confidence` is `low` or `rss_found` is false).
   - Actions: **Add source** (insert Supabase), **Back** (return to Step A without losing query text if useful), **Cancel** (close modal and reset).

### Editing before insert

- Allow the user to **edit the URL and Use RSS** on the review step so they can fix a bad resolve without leaving the modal.  
- If the user toggles **Use RSS** or changes the URL, treat it as **user override** — still persist `url` + `use_rss` as shown in the form (no second resolve unless you add an explicit “Re-resolve” later).

### Errors

- **HTTP 401** or invalid session: prompt **sign in again** (or surface auth error); do not treat as “no results.”
- **HTTP 4xx/5xx** or network failure: show a short message; allow retry from Step A.
- Response **`ok: false`:** show **`message`**; branch on **`error`** per [`resolve_api.md`](resolve_api.md) (`no_results`, `not_a_listing`, `upstream_timeout`) for copy or retry hints.

### Close / reset

- Closing the modal (success or cancel) clears steps, query, review fields, and errors so the next open starts clean.

## Client configuration

- **Base URL** for the resolve API is **environment-specific** (not the Supabase host). Add something like **`VITE_RESOLVE_API_BASE_URL`** (no trailing slash), e.g. `http://127.0.0.1:5000` locally, production URL in deploy. Document in `.env.example`.
- Request path: **`POST /api/sources/resolve`** (append to base URL).

## Supabase insert (unchanged shape)

```text
insert into sources: {
  user_id: <session user id>,
  url: <final URL from review step>,
  use_rss: <boolean from review step>,
  category_id: <id of the category section where Add source was clicked>
}
```

Re-use existing RLS patterns; handle unique constraint / validation errors from Postgres like any other insert.

## Implementation checklist

1. Env: `VITE_RESOLVE_API_BASE_URL` + example entry; read in a small `resolveSource(query, accessToken)` helper.
2. Obtain **access token** from the current Supabase session (`getSession()` or auth state) for the `Authorization` header.
3. Replace per-category inline “add source” form with **Add source** button + modal (two steps above).
4. **Uncategorized** block: same modal flow with `category_id: null` (if you keep that section).
5. Manual test: happy path, `ok: false` paths, 401, offline/network error, confirm insert appears under the correct category.
