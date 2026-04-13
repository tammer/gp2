# Client report: database changes for LLM instructions

This document describes **structural changes** to the Supabase schema so client applications (web, mobile, admin tools) can be updated. The backend ingest pipeline (`news-manager --from-db`) already assumes this schema.

## Summary

| Before | After |
|--------|--------|
| **Global** instructions: one row per user in `public.user_instructions` | **Removed.** There is no user-wide instruction table. |
| **Per-source** instructions: column `public.sources.instruction` | **Removed.** Sources no longer carry their own instruction text. |
| *(none)* | **Per-category** instructions: column `public.categories.instruction` (single text field shared by all sources in that category). |

**Semantics:** For filtering and summarization, the system uses **only** the instruction string on the **category** that a source points to via `sources.category_id`. Every source in the same category receives the **same** instruction when content is processed.

**Data migration:** Existing rows in `user_instructions` and values in `sources.instruction` are **not** migrated automatically. If you still need that wording, copy it into the appropriate `categories.instruction` (or redesign copy per category) **before or after** applying the server migration.

---

## Table: `public.categories`

### Added column

| Column | Type | Default | Notes |
|--------|------|---------|--------|
| `instruction` | `text` | `''` | User-facing copy that describes what belongs in this category for the LLM (tone, topics, exclusions, etc.). |

### Client responsibilities

- **Read** `instruction` wherever the UI shows or edits “rules” for a category.
- **Write** `instruction` when the user updates those rules (subject to RLS — see below).
- Ensure new categories set `instruction` explicitly if the empty string is not desired.

Unique constraint remains **`(user_id, name)`** (unchanged).

---

## Table: `public.sources`

### Removed column

| Column | Status |
|--------|--------|
| `instruction` | **Dropped.** Do not select, insert, or update this field. |

### Client responsibilities

- Remove any UI or API calls that read/write **per-URL** or **per-source** instruction text.
- Sources still require a valid **`category_id`**; instruction context comes **only** from the linked category.

---

## Table: `public.user_instructions`

### Removed entirely

The table **`public.user_instructions`** is **dropped** (including its RLS policies).

### Client responsibilities

- Remove all code paths that **select / insert / update / delete** `user_instructions`.
- Remove UI for “global instructions” or “account-wide prompt” if it was backed by this table.
- If you still want one default policy for **all** categories, either:
  - duplicate sensible default text into each category’s `instruction`, or
  - implement defaults **only in the client** when `categories.instruction` is empty (the column defaults to `''` in the database).

---

## Row Level Security (RLS)

After migration, RLS for **`categories`** continues to govern owner access (`user_id = auth.uid()`). Clients using the **authenticated** Supabase role should use the same patterns as for `name` and other category fields: users may only manage their own categories, now including **`instruction`**.

The **`user_instructions`** policies are gone with the table. **`sources`** policies are unchanged in intent (full CRUD on own rows), but payloads must no longer include `instruction`.

---

## Suggested client checklist

1. Run the SQL migration on the Supabase project (see [`new_instructions_plan.md`](new_instructions_plan.md) in this repo).
2. Replace references to `user_instructions` with **`categories.instruction`** (per category).
3. Remove `sources.instruction` from types, forms, and mutations.
4. When displaying “effective rules” for a source, resolve **`category_id` → category row → `instruction`**.
5. Retest authenticated flows: create/update category including `instruction`; create/update source without instruction field.

---

## Reference: column shapes (post-migration)

**`categories`:** `id`, `user_id`, `name`, `instruction` (not null, default `''`), plus any other columns your project already uses.

**`sources`:** `id`, `user_id`, `url`, `use_rss`, `category_id` — **no** `instruction`.

**`user_instructions`:** table does not exist.

For the exact migration statements, use [`new_instructions_plan.md`](new_instructions_plan.md).
