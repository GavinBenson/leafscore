import { configureLocalNeon, hostOf, isLocalDatabaseUrl } from './neonLocal'

/**
 * Call at the top of any script that writes bulk data (seed, import --apply).
 * Heuristic: a database is "local" only if its host is localhost, 127.0.0.1,
 * ::1 or db.localtest.me. Anything else (Neon, RDS, ...) is treated as
 * production-like and refused unless ALLOW_PROD_SEED=1 is set explicitly.
 * Also wires up the local Neon HTTP proxy driver settings when applicable.
 */
export function assertSafeDbTarget(script: string, env: NodeJS.ProcessEnv = process.env): void {
  const url = env.DATABASE_URL
  if (!url) {
    console.error(`${script}: DATABASE_URL is not set.`)
    process.exit(1)
  }
  configureLocalNeon(url)
  if (isLocalDatabaseUrl(url) || env.ALLOW_PROD_SEED === '1') return
  const host = hostOf(url) ?? '(unparseable URL)'
  console.error(
    `${script}: refusing to run against non-local database host "${host}".\n` +
      `This looks like a hosted (possibly production) database. If you really mean it,\n` +
      `re-run with ALLOW_PROD_SEED=1 (e.g. ALLOW_PROD_SEED=1 npm run db:seed).`,
  )
  process.exit(1)
}
