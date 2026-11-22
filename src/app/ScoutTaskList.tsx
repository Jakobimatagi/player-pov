import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { getAuthSnap, subscribeAuth } from '../auth/session'
import { dueLabel } from '../data/assignments'
import type { ScoutTaskStatus } from '../data/database.types'
import { listFolders } from '../data/plays'
import { listScoutTasks, loadMyGroups, setScoutTaskStatus } from '../data/scoutTasks'
import { supabase } from '../data/supabase'
import { DEMO_FOLDERS } from '../playbook/archive'
import { breadcrumb, type Folder } from '../playbook/folders'
import { DEMO_ASSIGNEE, DEMO_PACK_FOLDERS, DEMO_TASKS } from '../playbook/scoutDemo'
import {
  dueState,
  myOpenTasks,
  STATUS_LABEL,
  STATUS_ORDER,
  type Me,
  type ScoutTask,
} from '../playbook/scoutPacks'
import '../playbook/scoutPacks.css'

/**
 * The scout pack sections delegated to the signed-in coach, or to a room they run, that
 * are not ready yet. Each opens the section on /playbook. Renders nothing when there are
 * none. `demo` shows the no-backend demo for the DC, who runs the LB room.
 */
export function ScoutTaskList({ demo = false }: { demo?: boolean }) {
  const snap = useSyncExternalStore(subscribeAuth, getAuthSnap, getAuthSnap)
  const [tasks, setTasks] = useState<ScoutTask[]>(() => (demo ? DEMO_TASKS : []))
  const [folders, setFolders] = useState<Folder[]>(() =>
    demo ? [...DEMO_FOLDERS, ...DEMO_PACK_FOLDERS] : [],
  )
  const [me, setMe] = useState<Me>(() => (demo ? DEMO_ASSIGNEE : { userId: null, groups: [] }))
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const teamId = snap.teamId
  const userId = snap.session?.user.id ?? null

  useEffect(() => {
    if (demo || supabase == null || teamId == null || userId == null) return
    let dead = false
    void (async () => {
      try {
        const [nextTasks, groups, tree] = await Promise.all([
          listScoutTasks(teamId),
          loadMyGroups(teamId, userId),
          listFolders(teamId),
        ])
        if (dead) return
        setTasks(nextTasks)
        setMe({ userId, groups })
        setFolders(tree.folders)
      } catch {
        // The home page still works without the task list.
      }
    })()
    return () => {
      dead = true
    }
  }, [demo, teamId, userId])

  const open = myOpenTasks(tasks, me)
  if (open.length === 0) return null

  async function change(task: ScoutTask, status: ScoutTaskStatus) {
    setError(null)
    try {
      const next = demo
        ? { ...task, status, statusBy: me.userId, statusAt: new Date().toISOString() }
        : await setScoutTaskStatus(task.id, status)
      setTasks((rows) => rows.map((row) => (row.id === task.id ? next : row)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the status')
    }
  }

  return (
    <section className="scout-tasks" aria-labelledby="scout-tasks-heading">
      <h2 id="scout-tasks-heading">Your scout tasks</h2>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="scout-task-list">
        {open.map((task) => {
          const path = breadcrumb(folders, task.folderId)
          const section = path[path.length - 1]?.name ?? 'Section'
          const where = path
            .slice(0, -1)
            .filter((folder) => folder.parentId != null)
            .map((folder) => folder.name)
            .join(' · ')
          const due = dueState(task, now)
          return (
            <li key={task.id} className="scout-task">
              <Link to={`/playbook?folder=${task.folderId}${demo ? '&roster=demo' : ''}`}>
                <strong>{section}</strong>
                <span>
                  {where.length > 0 ? `${where} · ` : ''}
                  {task.group != null ? `${task.group} room · ` : ''}
                  {task.dueAt != null ? `Due ${dueLabel(task.dueAt)}` : 'No due date'}
                  {due === 'overdue' ? ' · Overdue' : ''}
                </span>
              </Link>
              <span className="pack-task-actions">
                <select
                  aria-label={`Status for ${section}`}
                  value={task.status}
                  onChange={(event) => void change(task, event.target.value as ScoutTaskStatus)}
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
