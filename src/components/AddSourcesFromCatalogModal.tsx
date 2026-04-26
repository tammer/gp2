import { useEffect, useMemo, useRef, useState } from 'react'
import tammerFiltersCatalog from '@/data/tammer-filters-catalog.json'
import { pollPipelineJobUntilTerminal } from '@/lib/pipeline-api'
import { getResolveApiBaseUrl, postPipelineRun, type UserSourcesImportCatalog } from '@/lib/resolve-api'
import { usePipelinePending } from '@/lib/pipeline-pending-context'
import { supabase } from '@/lib/supabase'
import type { Category, Source } from '@/types/database'

type CatalogRow = {
  rowId: string
  defaultCategory: string
  url: string
  useRss: boolean
}

type RowStatus = 'idle' | 'adding' | 'added' | 'error'

type RowState = {
  categoryDraft: string
  status: RowStatus
  error: string | null
}

type AddSourcesFromCatalogModalProps = {
  open: boolean
  onClose: () => void
  userId: string
  getAccessToken: () => Promise<string | null>
  /** Called after a source is added successfully so the parent can reload categories (e.g. new category in dropdown). */
  onCategoriesChanged?: () => void
}

function tupleKey(category: string, url: string): string {
  return `${category}\u0000${url}`
}

function buildCatalogRows(): CatalogRow[] {
  const catalog = tammerFiltersCatalog as UserSourcesImportCatalog
  const rows: CatalogRow[] = []
  let index = 0
  for (const categoryEntry of catalog.categories ?? []) {
    for (const source of categoryEntry.sources ?? []) {
      rows.push({
        rowId: `catalog-row-${index}`,
        defaultCategory: categoryEntry.category,
        url: source.url,
        useRss: source.use_rss,
      })
      index += 1
    }
  }
  return rows
}

const CATALOG_ROWS = buildCatalogRows()

export function AddSourcesFromCatalogModal({
  open,
  onClose,
  userId,
  getAccessToken,
  onCategoriesChanged,
}: AddSourcesFromCatalogModalProps) {
  const { notifyRunAccepted, notifyRunSettled } = usePipelinePending()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const addedNoticeTimeoutRef = useRef<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rowsState, setRowsState] = useState<Record<string, RowState>>({})
  const [existingSet, setExistingSet] = useState<Set<string>>(new Set())
  /** URLs the user already has in any category (case-sensitive); catalog rows for these are hidden. */
  const [existingSourceUrls, setExistingSourceUrls] = useState<Set<string>>(new Set())
  const [knownCategories, setKnownCategories] = useState<Category[]>([])
  const [addedNotice, setAddedNotice] = useState<string | null>(null)

  const baseUrl = getResolveApiBaseUrl()

  function showAddedNotice(message: string) {
    setAddedNotice(message)
    if (addedNoticeTimeoutRef.current) {
      window.clearTimeout(addedNoticeTimeoutRef.current)
      addedNoticeTimeoutRef.current = null
    }
    addedNoticeTimeoutRef.current = window.setTimeout(() => {
      setAddedNotice(null)
      addedNoticeTimeoutRef.current = null
    }, 4000) as unknown as number
  }

  useEffect(() => {
    if (!open) {
      setAddedNotice(null)
      if (addedNoticeTimeoutRef.current) {
        window.clearTimeout(addedNoticeTimeoutRef.current)
        addedNoticeTimeoutRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (addedNoticeTimeoutRef.current) {
        window.clearTimeout(addedNoticeTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      if (!d.open) d.showModal()
    } else if (d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const initialState: Record<string, RowState> = {}
    for (const row of CATALOG_ROWS) {
      initialState[row.rowId] = {
        categoryDraft: row.defaultCategory,
        status: 'idle',
        error: null,
      }
    }
    setRowsState(initialState)
    setLoadError(null)
  }, [open])

  useEffect(() => {
    if (!open || !supabase) return
    const sb = supabase
    let cancelled = false
    const loadExisting = async () => {
      setLoading(true)
      setLoadError(null)
      const [catsRes, srcRes] = await Promise.all([
        sb
          .from('categories')
          .select('id,user_id,name,instruction')
          .eq('user_id', userId),
        sb
          .from('sources')
          .select('id,user_id,url,use_rss,category_id')
          .eq('user_id', userId),
      ])
      if (cancelled) return
      if (catsRes.error) {
        setLoadError(catsRes.error.message)
        setLoading(false)
        return
      }
      if (srcRes.error) {
        setLoadError(srcRes.error.message)
        setLoading(false)
        return
      }
      const cats = (catsRes.data ?? []) as Category[]
      const sources = (srcRes.data ?? []) as Source[]
      const byId = new Map(cats.map((c) => [c.id, c.name]))
      const keySet = new Set<string>()
      const urlSet = new Set<string>()
      for (const source of sources) {
        urlSet.add(source.url)
        if (!source.category_id) continue
        const categoryName = byId.get(source.category_id)
        if (!categoryName) continue
        keySet.add(tupleKey(categoryName, source.url))
      }
      setKnownCategories(cats)
      setExistingSet(keySet)
      setExistingSourceUrls(urlSet)
      setLoading(false)
    }
    void loadExisting()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  const visibleRows = useMemo(
    () =>
      CATALOG_ROWS.filter(
        (row) => Boolean(rowsState[row.rowId]) && !existingSourceUrls.has(row.url),
      ),
    [rowsState, existingSourceUrls],
  )

  function handleDialogClose() {
    onClose()
  }

  function closeModal() {
    dialogRef.current?.close()
  }

  function setRowPatch(rowId: string, patch: Partial<RowState>) {
    setRowsState((prev) => {
      const current = prev[rowId]
      if (!current) return prev
      return {
        ...prev,
        [rowId]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  async function ensureCategoryId(name: string): Promise<string> {
    let existing = knownCategories.find((c) => c.name === name)
    if (existing) return existing.id
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, name, instruction: '' })
      .select('id,user_id,name,instruction')
      .single()
    if (error) {
      const { data: latest, error: latestError } = await supabase
        .from('categories')
        .select('id,user_id,name,instruction')
        .eq('user_id', userId)
      if (latestError) throw new Error(error.message)
      const latestRows = (latest ?? []) as Category[]
      setKnownCategories(latestRows)
      existing = latestRows.find((c) => c.name === name)
      if (existing) return existing.id
      throw new Error(error.message)
    }
    const inserted = data as Category
    setKnownCategories((prev) => [...prev, inserted])
    return inserted.id
  }

  async function handleAddRow(row: CatalogRow) {
    const state = rowsState[row.rowId]
    if (!state || state.status === 'adding' || state.status === 'added') return
    const categoryName = state.categoryDraft.trim()
    if (!categoryName) {
      setRowPatch(row.rowId, { status: 'error', error: 'Suggested category is required.' })
      return
    }
    if (!supabase) {
      setRowPatch(row.rowId, { status: 'error', error: 'Supabase is not configured.' })
      return
    }
    const tuple = tupleKey(categoryName, row.url)
    if (existingSet.has(tuple)) return

    setRowPatch(row.rowId, { status: 'adding', error: null })

    try {
      const categoryId = await ensureCategoryId(categoryName)
      const { data: inserted, error: insertError } = await supabase
        .from('sources')
        .insert({
          user_id: userId,
          category_id: categoryId,
          url: row.url,
          use_rss: row.useRss,
        })
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)

      setExistingSet((prev) => {
        const next = new Set(prev)
        next.add(tuple)
        return next
      })
      setExistingSourceUrls((prev) => {
        const next = new Set(prev)
        next.add(row.url)
        return next
      })

      setRowPatch(row.rowId, { status: 'added', error: null })
      onCategoriesChanged?.()
      showAddedNotice(`Source added to “${categoryName}”.`)

      const sourceId =
        inserted && typeof inserted === 'object' && 'id' in inserted && typeof inserted.id === 'string'
          ? inserted.id
          : null
      if (!sourceId || !baseUrl) return
      const token = await getAccessToken()
      if (!token) return

      void (async () => {
        const out = await postPipelineRun(baseUrl, { source: sourceId }, token)
        if (out.kind !== 'success') {
          setRowsState((prev) => {
            const current = prev[row.rowId]
            if (!current || current.status !== 'added') return prev
            return {
              ...prev,
              [row.rowId]: {
                ...current,
                error: `Source added, but refresh failed: ${out.message}`,
              },
            }
          })
          return
        }
        notifyRunAccepted()
        try {
          await pollPipelineJobUntilTerminal(baseUrl, token, out.data.job_id)
        } finally {
          notifyRunSettled()
        }
      })()
    } catch (err: unknown) {
      setRowPatch(row.rowId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Could not add this source.',
      })
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby="add-sources-from-catalog-title"
      onClose={handleDialogClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal()
      }}
    >
      <div className="modal-dialog__panel add-sources-catalog">
        <header className="modal-dialog__header">
          <h2 id="add-sources-from-catalog-title" className="modal-dialog__title">
            Add Sources
          </h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={closeModal} aria-label="Close">
            Close
          </button>
        </header>

        {/* <p className="muted add-sources-catalog__intro">
          Only catalog sources you do not already have (same URL, any category) are listed. Suggested category is editable per row. The same URL under the same category cannot be added twice.
        </p> */}

        {addedNotice ? (
          <p className="add-sources-catalog__added-toast" role="status" aria-live="polite">
            {addedNotice}
          </p>
        ) : null}

        {!baseUrl ? (
          <p className="form-error" role="alert">
            Resolve API URL is not configured.
          </p>
        ) : null}
        {loadError ? (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading your existing sources…</p>
        ) : visibleRows.length === 0 ? (
          <p className="muted">No catalog sources left to add — you already have every URL here (in any category).</p>
        ) : (
          <div className="add-sources-catalog__list" role="list">
            {visibleRows.map((row) => {
              const state = rowsState[row.rowId]
              if (!state) return null
              const isBusy = state.status === 'adding'
              const isAdded = state.status === 'added'
              const tupleExists = existingSet.has(tupleKey(state.categoryDraft.trim(), row.url))
              return (
                <div className="add-sources-catalog__row" role="listitem" key={row.rowId}>
                  <div className="add-sources-catalog__source-row">
                    <a
                      className="add-sources-catalog__source-link"
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {row.url}
                    </a>
                  </div>
                  <label className="field add-sources-catalog__category-row">
                    <span className="field__label add-sources-catalog__category-label">Suggested Category:</span>
                    <input
                      className="input add-sources-catalog__category-input"
                      value={state.categoryDraft}
                      onChange={(e) => {
                        const nextCategory = e.target.value
                        setRowPatch(row.rowId, {
                          categoryDraft: nextCategory,
                          status: isAdded ? 'added' : 'idle',
                          error: null,
                        })
                      }}
                      disabled={isBusy || isAdded}
                    />
                  </label>
                  <div className="add-sources-catalog__action-row">
                    <div className="add-sources-catalog__action-row-btn-wrap">
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        disabled={isBusy || isAdded || tupleExists || !state.categoryDraft.trim()}
                        onClick={() => void handleAddRow(row)}
                      >
                        {isBusy ? 'Adding…' : isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                    {!isAdded && tupleExists ? (
                      <p className="muted add-sources-catalog__row-note" role="status">
                        Already added for this exact category/source pair.
                      </p>
                    ) : null}
                    {state.error ? (
                      <p
                        className={
                          isAdded ? 'muted add-sources-catalog__row-note' : 'form-error add-sources-catalog__row-note'
                        }
                        role="alert"
                      >
                        {state.error}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </dialog>
  )
}
