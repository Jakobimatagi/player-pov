/** Shown while a lost WebGL context is being restored. Playback stays paused. */
export function ContextLossOverlay({ heldT }: { heldT: number }) {
  return (
    <div className="banner" data-testid="context-loss" data-held-t={heldT.toFixed(2)} role="status">
      <p>Graphics reset, restoring…</p>
    </div>
  )
}
