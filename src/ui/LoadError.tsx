import { formatLoadErrors } from './formatErrors'
import type { PlayLoadError } from '../play/types'

/** Validation and fetch failures. Nothing from the play is drawn. */
export function LoadError({
  errors,
  url,
  onRetry,
}: {
  errors: readonly PlayLoadError[]
  url: string
  onRetry: () => void
}) {
  const { groups, more } = formatLoadErrors(errors)
  return (
    <div className="fallback" data-testid="load-error">
      <header className="topbar">
        <span className="wordmark">POV Playbook</span>
        <span className="topbar-muted">Film Room</span>
      </header>
      <section className="error-panel">
        <h1>Couldn't load this play</h1>
        <p>{url}</p>
        <ul>
          {groups.map((group) => (
            <li key={group.id}>
              <strong>{group.id}</strong>
              <ul>
                {group.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {more > 0 && <p data-testid="error-more">…and {more} more</p>}
        <p className="row">
          <button type="button" className="btn" onClick={onRetry}>
            Retry
          </button>
        </p>
      </section>
    </div>
  )
}
