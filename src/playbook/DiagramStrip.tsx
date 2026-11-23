import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { loadRemoteScript } from '../data/diagrams'
import { DiagramScene } from '../diagram/DiagramScene'
import { useScenePalette } from '../theme/useScenePalette'
import { browserStore, savedScript, storageKey, type DiagramScript } from '../diagram/script'

/**
 * The diagrams drawn into a playbook, as thumbnails, each opening the editor. They come from
 * the database, or from this device in the demo. Nothing shows until something is drawn.
 */
export function DiagramStrip({
  folderId,
  rosterQuery,
  remote,
}: {
  folderId: string
  rosterQuery: string
  remote: boolean
}) {
  const palette = useScenePalette()
  const [script, setScript] = useState<DiagramScript | null>(() =>
    remote ? null : savedScript(storageKey(folderId), browserStore()),
  )

  useEffect(() => {
    if (!remote) return
    let dead = false
    loadRemoteScript(folderId)
      .then((found) => {
        if (!dead) setScript(found?.script ?? null)
      })
      .catch(() => {
        // The strip is a convenience: if it cannot load, the playbook still works.
      })
    return () => {
      dead = true
    }
  }, [folderId, remote])

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
              <DiagramScene
                diagram={play.diagram}
                width={96}
                height={128}
                interactive={false}
                palette={palette}
              />
              <span className="dg-num">{index + 1}</span>
              <span>{play.name}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
