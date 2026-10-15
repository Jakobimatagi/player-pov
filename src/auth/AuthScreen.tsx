import type { ReactNode } from 'react'

export function AuthScreen({
  children,
  hint,
  banner,
}: {
  children: ReactNode
  hint?: string
  banner?: string
}) {
  return (
    <div className="auth-screen">
      <p className="auth-wordmark">
        <span>POV</span> <span className="auth-playbook">Playbook</span>
      </p>
      {banner ? <p className="auth-banner">{banner}</p> : null}
      <div className="auth-card" data-testid="auth-card">
        {children}
      </div>
      {hint ? <p className="auth-hint">{hint}</p> : null}
    </div>
  )
}

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
