import { Link } from 'react-router'
import { DiagramScene } from '../diagram/DiagramScene'
import { browserStore, savedScript, storageKey } from '../diagram/script'

/**
 * The diagrams drawn into a playbook, as thumbnails. They come from this device's storage
 * for now, and each opens the editor on that play. Nothing shows until something is drawn.
 */
export function DiagramStrip({ folderId, rosterQuery }: { folderId: string; rosterQuery: string }) {
  const script = savedScript(storageKey(folderId), browserStore())
  if (script == null) return null
  const drawn = script.plays.some(
    (play) => play.diagram.lines.length > 0 || play.diagram.notes.length > 0,
  )
  if (!drawn) return null
  return (
    <section aria-label="Diagrams">
      <h2 className="folder-heading">Diagrams</h2>
      <ol className="dg-script">
        {script.plays.map((play, index) => (
          <li key={play.id}>
            <Link
              to={`/diagram?playbook=${folderId}${rosterQuery}`}
              aria-label={`Open diagram ${index + 1}: ${play.name}`}
              className="dg-card"
            >
              <DiagramScene diagram={play.diagram} width={96} height={128} interactive={false} />
              <span className="dg-num">{index + 1}</span>
              <span>{play.name}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
