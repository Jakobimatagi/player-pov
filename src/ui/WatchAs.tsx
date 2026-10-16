import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cameraState, notePlay, subscribeCamera, watchPlayer } from '../camera/cameraState'
import type { CompiledPlay } from '../play/types'
import { watchChoices, type WatchChoice } from './watchLabel'

/** Watch as: grouped player list. Phone uses a bottom sheet; wider screens use a menu. */
export function WatchAs({
  play,
  qbIndex,
  onFrameloop,
  openRef,
  closeRef,
}: {
  play: CompiledPlay
  qbIndex: number
  onFrameloop: (mode: 'always' | 'demand' | 'never') => void
  openRef: { current: boolean }
  closeRef: { current: () => void }
}) {
  const [open, setOpen] = useState(false)
  const [watchIndex, setWatchIndex] = useState(cameraState.watchAs)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const offenseId = useId()
  const defenseId = useId()
  const choices = watchChoices(play)
  const selected =
    watchIndex < 0 ? undefined : choicesForIndex(choices.offense, choices.defense, watchIndex)
  const label = selected == null ? 'Watch as' : `Watch as: ${selected.label}`

  useLayoutEffect(() => {
    openRef.current = open
    closeRef.current = () => {
      setOpen(false)
      buttonRef.current?.focus()
    }
  }, [open, openRef, closeRef])

  useEffect(() => subscribeCamera(() => setWatchIndex(cameraState.watchAs)), [])

  useEffect(() => {
    notePlay(play.meta.id, qbIndex)
  }, [play.meta.id, qbIndex])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const button = buttonRef.current
    if (menu == null || button == null) return
    const place = () => {
      const hud = button.closest('.hud')
      const hudTop = hud?.getBoundingClientRect().top ?? button.getBoundingClientRect().top
      const bottom = Math.max(8, window.innerHeight - hudTop + 8)
      const sheet = window.matchMedia('(max-width: 767px)').matches
      menu.dataset['sheet'] = sheet ? 'true' : 'false'
      menu.style.bottom = `${bottom}px`
      menu.style.maxHeight = `${Math.max(44, window.innerHeight - bottom - 16)}px`
      if (sheet) {
        menu.style.left = '0px'
        menu.style.right = '0px'
        menu.style.width = 'auto'
      } else {
        menu.style.right = 'auto'
        menu.style.width = 'min(20rem, calc(100% - 1rem))'
        const width = menu.getBoundingClientRect().width
        const rect = button.getBoundingClientRect()
        const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
        menu.style.left = `${left}px`
      }
      const backdrop = menu.previousElementSibling
      if (backdrop instanceof HTMLElement) backdrop.style.bottom = `${bottom}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, watchIndex])

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (menu == null) return
    const current = menu.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
    const first = menu.querySelector<HTMLElement>('[role="option"]')
    const target = current ?? first
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const pick = (index: number) => {
    watchPlayer(index, qbIndex)
    if (cameraState.movingRef.current) onFrameloop('always')
    close()
  }

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'))
    const current = options.indexOf(document.activeElement as HTMLElement)
    if (
      options.length > 0 &&
      (event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Home' ||
        event.key === 'End')
    ) {
      event.preventDefault()
      event.stopPropagation()
      let next = 0
      if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % options.length
      else if (event.key === 'ArrowUp')
        next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length
      else if (event.key === 'End') next = options.length - 1
      const option = options[next]
      option?.focus({ preventScroll: true })
      option?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn watch-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-testid="watch-as"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (open) return
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
      >
        {label}
      </button>
      {open && (
        <div className="watch-layer">
          <button
            type="button"
            className="watch-backdrop"
            aria-label="Close watch list"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            ref={menuRef}
            className="watch-menu"
            data-testid="watch-list"
            data-sheet="false"
            onKeyDown={onMenuKey}
          >
            <div className="watch-head">
              <span>Watch as</span>
              <button type="button" className="btn" onClick={close}>
                Close
              </button>
            </div>
            <div id={listId} role="listbox" aria-label="Watch as">
              <WatchGroup
                title="Offense"
                titleId={offenseId}
                choices={choices.offense}
                watchIndex={watchIndex}
                onPick={pick}
              />
              <WatchGroup
                title="Defense"
                titleId={defenseId}
                choices={choices.defense}
                watchIndex={watchIndex}
                onPick={pick}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function choicesForIndex(
  offense: WatchChoice[],
  defense: WatchChoice[],
  index: number,
): WatchChoice | undefined {
  return (
    offense.find((choice) => choice.index === index) ??
    defense.find((choice) => choice.index === index)
  )
}

function WatchGroup({
  title,
  titleId,
  choices,
  watchIndex,
  onPick,
}: {
  title: string
  titleId: string
  choices: WatchChoice[]
  watchIndex: number
  onPick: (index: number) => void
}) {
  if (choices.length === 0) return null
  return (
    <div role="group" aria-labelledby={titleId}>
      <div id={titleId} className="watch-group-label">
        {title}
      </div>
      {choices.map((choice) => (
        <button
          key={choice.index}
          type="button"
          role="option"
          className="watch-option"
          aria-selected={choice.index === watchIndex}
          tabIndex={-1}
          data-testid={`watch-option-${choice.id}`}
          onClick={() => onPick(choice.index)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}
