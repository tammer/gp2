# Plan: Settings page (Apr 13)

## Context

Schema and API expectations are documented in [`server_changes.md`](server_changes.md). Highlights for this work:

- **Instructions** live on **`categories.instruction`** only (not per-source, not global `user_instructions`).
- **`sources`** no longer have an `instruction` column; each source still has **`category_id`**.
- Remove all use of **`user_instructions`** and **`sources.instruction`**.

## Remove

- **Sources** page (routes, nav entry, and any-only flows should move under Settings or elsewhere as needed).
- **Instructions** page (its responsibilities move into Settings; see exclusions note below).

## Add: **Settings** page

Single place to manage categories, their instructions, sources, and recent exclusions—**grouped by category**.

### Create category

- Prominent control on Settings (e.g. **Add category** at the top): prompt for **name**, then **insert** into **`categories`** with **`instruction`** defaulting to empty (or an optional initial instruction in the same flow).
- Enforce the DB rule: **`(user_id, name)` must be unique** per [`server_changes.md`](server_changes.md). Surface a clear error if the name collides with another of the user’s categories.

### Layout (per category)

Use one block per category, in a sensible order (e.g. alphabetical by name or existing app ordering).

#### Category header

- Show the category **name** as the main heading for that block.
- **Rename**: let the user change **`categories.name`** (inline edit, or edit next to the title—match existing UX). Same **unique `(user_id, name)`** validation as create; confirm destructive impact if anything in the UI caches names (sources and exclusions are keyed by **`category_id`**, so IDs stay stable).

#### Instructions

- Display **`categories.instruction`** for that category (empty state if `''`).
- **Edit** control opens editing (inline or modal—match existing patterns). Persist with the same RLS-backed updates as other category fields.

#### Sources

- List all **sources** where **`sources.category_id`** matches this category.
- Each row: enough to identify the source (e.g. URL) plus **Delete** (existing delete behavior / confirmations).

#### Recent exclusions (collapsible)

- Show the **10** most recent excluded articles **for this category** (newest first). Filter **`news_article_exclusions`** by **`category_id`** (same table as on **`InstructionsPage`** today; tighten the query per category and change the limit from 25 to **10**).
- Section is **collapsed by default**; user expands to see the list (accordion or disclosure pattern).

### Global / navigation

- Add **Settings** to the app shell (sidebar, tabs, or equivalent).
- Ensure deep links or back navigation still make sense after removing Sources and Instructions.

## Implementation checklist (suggested)

1. Update types and Supabase calls per **`server_changes.md`** (drop `user_instructions` / `sources.instruction`; read/write **`categories.instruction`**).
2. Build Settings layout: fetch categories (with instructions), then sources per category.
3. Implement **create category** (insert) and **rename category** (update `name`) with duplicate-name handling.
4. Port or reimplement exclusions UI from **`InstructionsPage`** into the per-category collapsible (adjust limit to **10** and filter by category if required).
5. Remove dead routes, components, and nav items for Sources and Instructions.
6. Smoke-test: create and rename category (including name collision), edit category instruction, add/delete source, view exclusions, all as an authenticated user.
