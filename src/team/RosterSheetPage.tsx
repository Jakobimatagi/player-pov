import { useState, type KeyboardEvent } from 'react'
import type { PositionCode } from '../data/database.types'
import type { RosterPatch } from '../data/roster'
import {
  formatHeight,
  matchesFilter,
  parseHeight,
  parsePositions,
  parseRosterTable,
  splitNewPlayers,
  parseWhole,
  POSITION_CODES,
  sortRoster,
  type RosterFilter,
  type RosterPlayer,
  type RosterSort,
} from './roster'
import { TeamShell } from './TeamShell'
import { useTeamRoster } from './useTeamRoster'
import './team.css'

const FILTERS: { id: RosterFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special teams' },
  { id: 'unassigned', label: 'No position' },
]

const SORTS: { id: RosterSort; label: string }[] = [
  { id: 'jersey', label: '#' },
  { id: 'name', label: 'Name' },
  { id: 'position', label: 'Pos' },
  { id: 'gradYear', label: 'Grad yr' },
]

export function RosterSheetPage() {
  const team = useTeamRoster()
  const { snap, demo, players } = team
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [sort, setSort] = useState<RosterSort>('jersey')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const headCoach = demo || snap.role === 'head_coach'
  const needle = search.trim().toLowerCase()
  const shown = sortRoster(
    players.filter(
      (player) =>
        matchesFilter(player, filter) &&
        (needle === '' ||
          player.name.toLowerCase().includes(needle) ||
          String(player.jersey ?? '') === needle.replace(/^#/, '')),
    ),
    sort,
  )
  const typedIn = sortRoster(
    players.filter((player) => player.userId == null),
    'name',
  )

  async function run(action: () => Promise<unknown>, ok?: string) {
    setNotice(null)
    try {
      await action()
      if (ok) setNotice({ kind: 'ok', text: ok })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save' })
    }
  }

  const patch = (player: RosterPlayer, change: RosterPatch) =>
    run(() => team.update(player.id, change))

  return (
    <TeamShell title="Roster" snap={snap} demo={demo} wide>
      <div className="sheet-toolbar">
        <input
          className="playbook-search"
          type="search"
          aria-label="Search roster"
          placeholder="Search name or #"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="playbook-action"
          aria-expanded={pasteOpen}
          onClick={() => setPasteOpen((open) => !open)}
        >
          Import roster
        </button>
      </div>
      <div className="roster-filters" role="group" aria-label="Show">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pasteOpen ? (
        <PastePanel
          roster={players}
          onImport={async (rows) => {
            await team.add(rows)
            setPasteOpen(false)
            setNotice({
              kind: 'ok',
              text: `Added ${rows.length} ${rows.length === 1 ? 'player' : 'players'}`,
            })
          }}
        />
      ) : null}
      {notice ? (
        <p
          className={notice.kind === 'ok' ? 'playbook-success' : 'auth-error'}
          role={notice.kind === 'ok' ? 'status' : 'alert'}
        >
          {notice.text}
        </p>
      ) : null}
      {team.loading ? <p className="loading-line">Loading…</p> : null}
      {team.error ? <p className="auth-error">{team.error}</p> : null}

      <p className="sheet-count">
        {shown.length === players.length
          ? `${players.length} players`
          : `${shown.length} of ${players.length} players`}
      </p>
      <div className="sheet-scroll">
        <table className="sheet" aria-label="Roster">
          <colgroup>
            <col className="c-jersey" />
            <col className="c-name" />
            <col className="c-position" />
            <col className="c-gradYear" />
            <col className="c-also" />
            <col className="c-ht" />
            <col className="c-wt" />
            <col className="c-account" />
            <col className="c-notes" />
            <col className="c-actions" />
          </colgroup>
          <thead>
            <tr>
              {SORTS.map((item) => (
                <th
                  key={item.id}
                  aria-sort={sort === item.id ? 'ascending' : 'none'}
                  className={`col-${item.id}`}
                >
                  <button type="button" onClick={() => setSort(item.id)}>
                    {item.label}
                    {sort === item.id ? ' ▲' : ''}
                  </button>
                </th>
              ))}
              <th>Also plays</th>
              <th className="col-num">Ht</th>
              <th className="col-num">Wt</th>
              <th>Account</th>
              <th className="col-notes">Staff notes</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((player) => (
              <tr key={player.id} data-testid={`row-${player.id}`}>
                <td className="col-jersey">
                  <Cell
                    label={`Number for ${player.name}`}
                    value={player.jersey == null ? '' : String(player.jersey)}
                    parse={(raw) => parseWhole(raw, 0, 99)}
                    inputMode="numeric"
                    onCommit={(jersey) => patch(player, { jersey })}
                  />
                </td>
                <td className="col-name">
                  <Cell
                    label={`Name for ${player.name}`}
                    value={player.name}
                    parse={(raw) => (raw.trim() === '' ? 'invalid' : raw.trim().slice(0, 80))}
                    onCommit={(name) =>
                      name == null ? Promise.resolve() : patch(player, { name })
                    }
                  />
                </td>
                <td className="col-position">
                  <select
                    className="sheet-cell"
                    aria-label={`Position for ${player.name}`}
                    value={player.position ?? ''}
                    disabled={player.userId != null && !headCoach}
                    title={
                      player.userId != null && !headCoach
                        ? 'Only the head coach changes the position of a player with an app account'
                        : undefined
                    }
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      void patch(player, {
                        position: value === '' ? null : (value as PositionCode),
                      })
                    }}
                  >
                    <option value="">—</option>
                    {POSITION_CODES.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </td>
                <td className="col-gradYear">
                  <Cell
                    label={`Grad year for ${player.name}`}
                    value={player.gradYear == null ? '' : String(player.gradYear)}
                    parse={(raw) => parseWhole(raw, 2000, 2100)}
                    inputMode="numeric"
                    onCommit={(gradYear) => patch(player, { gradYear })}
                  />
                </td>
                <td>
                  <Cell
                    label={`Other positions for ${player.name}`}
                    value={player.altPositions.join(', ')}
                    parse={(raw) => parsePositions(raw).filter((code) => code !== player.position)}
                    onCommit={(altPositions) => patch(player, { altPositions: altPositions ?? [] })}
                  />
                </td>
                <td className="col-num">
                  <Cell
                    label={`Height for ${player.name}`}
                    value={formatHeight(player.heightIn)}
                    placeholder={`5'10"`}
                    parse={parseHeight}
                    onCommit={(heightIn) => patch(player, { heightIn })}
                  />
                </td>
                <td className="col-num">
                  <Cell
                    label={`Weight for ${player.name}`}
                    value={player.weightLb == null ? '' : String(player.weightLb)}
                    parse={(raw) => parseWhole(raw.replace(/\s*lbs?$/i, ''), 60, 450)}
                    inputMode="numeric"
                    onCommit={(weightLb) => patch(player, { weightLb })}
                  />
                </td>
                <td className="col-account">
                  {player.userId == null ? (
                    <span className="sheet-badge">No account</span>
                  ) : (
                    <span className="sheet-account">
                      <span className="sheet-badge" data-linked="true">
                        App account
                      </span>
                      {typedIn.length > 0 ? (
                        <select
                          className="sheet-cell sheet-merge"
                          aria-label={`Merge a typed-in row into ${player.name}`}
                          value=""
                          onChange={(event) => {
                            const dropId = event.currentTarget.value
                            const drop = players.find((row) => row.id === dropId)
                            if (drop == null) return
                            void run(
                              () => team.merge(player.id, dropId),
                              `Merged ${drop.name} into ${player.name}`,
                            )
                          }}
                        >
                          <option value="">Merge…</option>
                          {typedIn.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.jersey == null ? '' : `#${row.jersey} `}
                              {row.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="col-notes">
                  <Cell
                    label={`Staff notes for ${player.name}`}
                    value={player.notes}
                    parse={(raw) => raw.slice(0, 1000)}
                    onCommit={(notes) => patch(player, { notes: notes ?? '' })}
                  />
                </td>
                <td className="col-actions">
                  {player.userId != null ? null : confirmDelete === player.id ? (
                    <span className="sheet-confirm">
                      <button
                        type="button"
                        className="playbook-action danger"
                        onClick={() => {
                          setConfirmDelete(null)
                          void run(() => team.remove(player.id), `${player.name} removed`)
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="playbook-action"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="sheet-delete"
                      aria-label={`Delete ${player.name}`}
                      onClick={() => setConfirmDelete(player.id)}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddRow onAdd={(row) => run(() => team.add([row]), `${row.name} added`)} />
      <p className="sheet-hint">
        Changes save when you leave a cell or press Enter. Players with an app account come from
        invites; remove them on the Members tab. Staff notes are never shown to players.
      </p>
    </TeamShell>
  )
}

/** A text cell that commits a parsed value on blur or Enter, and reverts on Escape. */
function Cell<T>({
  label,
  value,
  parse,
  onCommit,
  placeholder,
  inputMode,
}: {
  label: string
  value: string
  parse: (raw: string) => T | 'invalid'
  onCommit: (value: T) => Promise<unknown> | void
  placeholder?: string
  inputMode?: 'numeric' | 'text'
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const shown = draft ?? value

  function commit() {
    if (draft == null || draft === value) {
      setDraft(null)
      setInvalid(false)
      return
    }
    const parsed = parse(draft)
    if (parsed === 'invalid') {
      setInvalid(true)
      return
    }
    setDraft(null)
    setInvalid(false)
    void onCommit(parsed)
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      setDraft(null)
      setInvalid(false)
    }
  }

  return (
    <input
      className="sheet-cell"
      aria-label={label}
      aria-invalid={invalid}
      title={invalid ? 'Check this value' : undefined}
      value={shown}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(event) => {
        setDraft(event.currentTarget.value)
        setInvalid(false)
      }}
      onBlur={commit}
      onKeyDown={onKey}
    />
  )
}

function AddRow({ onAdd }: { onAdd: (row: RosterPatch & { name: string }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [jersey, setJersey] = useState('')
  const [position, setPosition] = useState<PositionCode | ''>('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const number = parseWhole(jersey, 0, 99)
    if (name.trim() === '') {
      setError('Enter a name')
      return
    }
    if (number === 'invalid') {
      setError('Numbers are 0–99')
      return
    }
    setError(null)
    await onAdd({ name: name.trim(), jersey: number, position: position === '' ? null : position })
    setName('')
    setJersey('')
    setPosition('')
  }

  return (
    <form
      className="sheet-add"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <input
        className="sheet-cell sheet-add-jersey"
        aria-label="New player number"
        placeholder="#"
        inputMode="numeric"
        value={jersey}
        onChange={(event) => setJersey(event.target.value)}
      />
      <input
        className="sheet-cell sheet-add-name"
        aria-label="New player name"
        placeholder="Player name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <select
        className="sheet-cell"
        aria-label="New player position"
        value={position}
        onChange={(event) => setPosition(event.target.value as PositionCode | '')}
      >
        <option value="">Pos</option>
        {POSITION_CODES.map((code) => (
          <option key={code}>{code}</option>
        ))}
      </select>
      <button type="submit" className="playbook-action primary">
        + Add player
      </button>
      {error ? (
        <span className="auth-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  )
}

function PastePanel({
  roster,
  onImport,
}: {
  roster: readonly RosterPlayer[]
  onImport: (rows: (RosterPatch & { name: string })[]) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = parseRosterTable(text)
  const { fresh, existing } = splitNewPlayers(parsed.players, roster)

  return (
    <section className="folder-panel" aria-label="Import roster">
      <h2>Import roster</h2>
      <p className="folder-hint">
        Choose a CSV file, or paste rows copied from Excel or Google Sheets. With a header row,
        columns are matched by name: Name (or First and Last), Number, Position, Class or Grad year,
        Height, Weight. Other columns are ignored. Without a header, use that order with the number
        first. To bring a roster over from Hudl or another app, export it as a CSV file and choose
        it here.
      </p>
      <label className="playbook-action sheet-file">
        Choose CSV file
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file == null) return
            if (file.size > 1_000_000) {
              setError('That file is over 1 MB. Export only the roster columns and try again.')
              return
            }
            setError(null)
            setFileName(file.name)
            void file.text().then(setText)
          }}
        />
      </label>
      {fileName ? <span className="folder-hint"> {fileName}</span> : null}
      <textarea
        className="sheet-paste"
        aria-label="Rows to import"
        rows={6}
        placeholder={
          'Number,First Name,Last Name,Position,Class,Height,Weight\n12,Marcus,Hill,QB,Jr,6-2,190'
        }
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setFileName(null)
        }}
      />
      {text.trim() !== '' ? (
        <div className="folder-hint" role="status">
          <p>
            {fresh.length} new {fresh.length === 1 ? 'player' : 'players'} ready
            {existing.length > 0
              ? `, ${existing.length} already on the roster (skipped: ${existing
                  .slice(0, 3)
                  .map((player) => player.name)
                  .join(', ')}${existing.length > 3 ? '…' : ''})`
              : ''}
            .
          </p>
          {parsed.columns.length > 0 ? <p>Columns found: {parsed.columns.join(', ')}.</p> : null}
          {parsed.problems.length > 0 ? (
            <p>
              {parsed.problems.slice(0, 3).join('; ')}
              {parsed.problems.length > 3 ? `; and ${parsed.problems.length - 3} more` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="playbook-actions">
        <button
          type="button"
          className="playbook-action primary"
          disabled={busy || fresh.length === 0}
          onClick={() => {
            setBusy(true)
            setError(null)
            onImport(fresh)
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Could not add'),
              )
              .finally(() => setBusy(false))
          }}
        >
          Add {fresh.length || ''} to roster
        </button>
      </div>
    </section>
  )
}
