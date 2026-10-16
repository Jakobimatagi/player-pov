import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    const keepScript = read('../scripts/keepalive.sh')
    const backupScript = read('../scripts/backup.sh')
    const scenario = read('../scenarios/deploy.md')
    expect(keep).toContain("cron: '0 15 */2 * *'")
    expect(keep).toContain('scripts/keepalive.sh')
    expect(keep).not.toContain('STAGING_')
    expect(keepScript).toContain('/rest/v1/rpc/health')
    expect(backup).toContain("cron: '0 10 * * *'")
    expect(backup).toContain('retention-days: 30')
    expect(backup).toContain('scripts/backup.sh')
    expect(backup).not.toContain('STAGING_')
    expect(backupScript).toContain('age -R')
    expect(backupScript).toContain('--schema public,auth')
    expect(backup).toContain('sha256sum -c')
    expect(read('../.github/workflows/ci.yml')).toContain('sha256sum -c')
    expect(read('../.github/workflows/activity.yml')).toContain("cron: '0 12 1 * *'")
    expect(read('../.github/workflows/activity.yml')).toContain('git commit --allow-empty')
    expect(deploy).toContain('environment: production')
    expect(deploy).not.toContain('environment: staging')
    expect(deploy).not.toContain('STAGING_')
    expect(scenario).toContain('prj_SRL6YyKAz9unWp7dEa4Xr5HQDxHe')
    expect(scenario).toContain('bfaopibbbldsxvjprfdx')
    expect(scenario).toContain('20261015120000_identity.sql')
    expect(scenario).toContain('20261015130100_health.sql')
  })

  it('keeps health invoker and scans bundle JWTs for a service role', () => {
    const health = read('../supabase/migrations/20261015130100_health.sql')
    const ci = read('../.github/workflows/ci.yml')
    expect(health).toContain('security invoker')
    expect(health).not.toContain('security definer')
    expect(health).toContain('select 1')
    expect(ci).toContain('gitleaks detect')
    expect(ci).toContain('scripts/scan-bundle.mjs')
    expect(read('../scenarios/deploy.md')).toContain('auth.users')
  })

  it('rejects a service-role JWT and ignores an anon JWT', () => {
    const token = (role: string) => {
      const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      return `${part({ alg: 'none' })}.${part({ role })}.signature`
    }
    const scan = (body: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
      writeFileSync(join(dir, 'app.js'), body)
      return spawnSync(process.execPath, ['scripts/scan-bundle.mjs', dir], { encoding: 'utf8' })
    }
    expect(scan(token('anon')).status).toBe(0)
    expect(scan(token('service_role')).status).toBe(1)
    expect(scan('SUPABASE_SERVICE_ROLE').status).toBe(1)
  })
})
