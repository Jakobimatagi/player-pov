import { groupLookOptions, type LookOption } from '../play/lookChoice'
import type { PlaySide } from '../play/sourceTypes'

/**
 * Which scout look to watch a play against. The same control sits beside Watch in 3D on
 * the play sheet and in the viewer; picking a look only changes the link, and the viewer
 * recompiles by navigating to `?look=`.
 */
export function LookSelect({
  playSide,
  looks,
  value,
  onChange,
  label = 'Against',
  testId = 'look-select',
}: {
  playSide: PlaySide
  looks: readonly LookOption[]
  value: string | null
  onChange: (lookId: string) => void
  label?: string
  testId?: string
}) {
  const groups = groupLookOptions(playSide, looks)
  if (groups.length === 0) return null
  const known = groups.some((group) => group.options.some((look) => look.id === value))
  return (
    <label className="look-select">
      <span className="look-select-label">{label}</span>
      <select
        data-testid={testId}
        value={known && value != null ? value : ''}
        onChange={(event) => {
          const next = event.currentTarget.value
          if (next !== '') onChange(next)
        }}
      >
        {!known ? (
          <option value="" disabled>
            Pick a scout look
          </option>
        ) : null}
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((look) => (
              <option key={look.id} value={look.id}>
                {look.charted ? `${look.name} (as charted)` : look.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
