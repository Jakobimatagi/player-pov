import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('hosting', () => {
  it('rewrites every path to the SPA shell', () => {
    const vercel = JSON.parse(read('../vercel.json')) as {
      rewrites: { source: string; destination: string }[]
    }
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
  })

  it('keeps the free-tier jobs on the documented schedules', () => {
    const keep = read('../.github/workflows/keepalive.yml')
    const backup = read('../.github/workflows/backup.yml')
    const deploy = read('../.github/workflows/deploy.yml')
    expect(keep).toContain("cron: '0 15 */2 * *'")
    expect(keep).toContain('/rest/v1/rpc/health')
    expect(backup).toContain("cron: '0 10 * * *'")
    expect(backup).toContain('age -R')
    expect(backup).toContain('retention-days: 30')
    expect(deploy).toContain('environment: staging')
    expect(deploy).toContain('environment: production')
    expect(deploy.indexOf('environment: staging')).toBeLessThan(
      deploy.indexOf('environment: production'),
    )
  })

  it('exposes a security-definer health function and scans for secrets', () => {
    const health = read('../supabase/migrations/20261015130100_health.sql')
    const ci = read('../.github/workflows/ci.yml')
    expect(health).toContain('security definer')
    expect(health).toContain('select 1')
    expect(ci).toContain('gitleaks detect')
    expect(ci).toContain('service_role')
  })
})
