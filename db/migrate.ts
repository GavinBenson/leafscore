import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'

import { configureLocalNeon } from './neonLocal'

// Why a Pool and not neon-http: the neon-http migrator runs every statement as
// its own autocommit request and records the migration only at the end, so a
// failure partway leaves a half-migrated database that cannot be re-run. The
// WebSocket Pool migrator runs all pending migrations inside one transaction
// (dialect.migrate -> session.transaction), so a failure rolls everything back.
async function main() {
  configureLocalNeon()
  // Node 22+ has a global WebSocket. Older Node needs one supplied; only then
  // fall back to the optional `ws` package (not a dependency of this project).
  if (typeof globalThis.WebSocket === 'undefined') {
    const { default: ws } = await import(/* @vite-ignore */ 'ws' as string)
    neonConfig.webSocketConstructor = ws
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
    console.log('Migrations complete.')
  } finally {
    await pool.end()
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
