import { getSourceChipColors } from '@/lib/sourceChipStyle'
import type { NewsArticle } from '@/types/database'

type ViewMode = 'unread' | 'read' | 'saved'

type Props = {
  article: NewsArticle
  view: ViewMode
  onSetRead: (id: string, read: boolean) => void
  onToggleSaved: (id: string, currentlySaved: boolean) => void
  onEditFilter: (article: Pick<NewsArticle, 'category_id' | 'short_summary' | 'why'>) => void
  busyRead: boolean
  busySaved: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function ArticleCard({
  article,
  view,
  onSetRead,
  onToggleSaved,
  onEditFilter,
  busyRead,
  busySaved,
}: Props) {
  const isSaved = article.saved === true
  const isRead = article.read === true
  const busy = busyRead || busySaved
  const showMarkRead = view !== 'saved' && !isRead
  const showUnmarkRead = view === 'read' && isRead

  return (
    <article className="article">
      <div className="article__source-row">
        {article.source.trim() ? (
          <span className="article__source-chip" style={getSourceChipColors(article.source)}>
            {article.source}
          </span>
        ) : null}
        <p className="article__meta">{formatDate(article.article_date)}</p>
      </div>
      <div className="article__section">
        <p className="article__short-summary">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className={
              article.short_summary
                ? 'article__short-summary-link'
                : 'article__short-summary-link article__short-summary-link--empty'
            }
          >
            {article.short_summary ? article.short_summary : 'No short summary.'}
          </a>{' '}
          {showMarkRead ? (
            <button
              type="button"
              className="btn btn--primary btn--inline-mark-read"
              disabled={busy}
              onClick={() => onSetRead(article.id, true)}
            >
              Mark read
            </button>
          ) : null}
        </p>
      </div>
      {/* <h2 className="article__headline">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.headline}
        </a>
      </h2> */}
      <div className="article__section">
        {article.full_summary ? (
          <p className="article__full-summary-body" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {article.full_summary}
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No full summary.
          </p>
        )}
      </div>
      <div className="article__actions">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => onToggleSaved(article.id, isSaved)}
        >
          {isSaved ? 'Unsave' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() =>
            onEditFilter({
              category_id: article.category_id,
              short_summary: article.short_summary,
              why: article.why,
            })
          }
        >
          Edit Filter
        </button>
        {showMarkRead ? (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onSetRead(article.id, true)}>
            Mark read
          </button>
        ) : null}
        {showUnmarkRead ? (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() => onSetRead(article.id, false)}
          >
            Unmark read
          </button>
        ) : null}
      </div>
    </article>
  )
}
