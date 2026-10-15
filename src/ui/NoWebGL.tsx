import { Diagram2D } from './Diagram2D'

async function shareLink(): Promise<void> {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    window.prompt('Copy this link', url)
  }
}

/** Shown when WebGL is missing, or after context loss gives up (§8a.1). */
export function NoWebGL({ showReload }: { showReload: boolean }) {
  return (
    <div className="fallback" data-testid="no-webgl">
      <header className="topbar">
        <span className="wordmark">POV Playbook</span>
        <span className="topbar-muted">Film Room</span>
      </header>
      <div className="fallback-grid">
        <section>
          <h1>This device or browser can't show 3D</h1>
          <p>You can still study the play on the 2D diagram. Share still works.</p>
          <ol>
            <li>
              Enable hardware acceleration in <code>chrome://settings/system</code>
            </li>
            <li>Update ChromeOS</li>
          </ol>
          <p className="row">
            <button type="button" className="btn primary" onClick={() => void shareLink()}>
              Share link
            </button>
            {showReload && (
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Reload
              </button>
            )}
          </p>
        </section>
        <Diagram2D />
      </div>
    </div>
  )
}
