// Why a Pool and not neon-http: review writes touch several rows (review, tags,
// tea score) and must be atomic. neon-http has no interactive transactions.
// db.batch() would give atomicity on neon-http, but the PGlite driver used in
// tests has no batch(), so it could not be tested. drizzle-orm/neon-serverless
// (WebSocket Pool) and drizzle-orm/pglite both implement db.transaction(), so
// the same data code runs and is tested identically. Node 22+ (Vercel) has a
// global WebSocket, so no `ws` package is needed. Writes lock the tea row
// (SELECT ... FOR UPDATE) inside the transaction so concurrent recomputes
// serialize; see lib/data/reviews.ts.
import 'server-only'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { captureError } from '@/lib/observability'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local (see .env.example).')
}

// Use Neon's pooled (-pooler) connection string for DATABASE_URL at runtime.
// Idle clients die when the compute suspends or the network drops; pg-pool
// emits 'error' for that, and an unhandled 'error' event crashes the process,
// so we log it and let the pool discard the client. A short idle timeout keeps
// serverless instances from holding stale sockets across freeze/thaw.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 5_000,
  maxUses: 500,
})
pool.on('error', (error: Error) => {
  captureError(error, { source: 'db-pool', kind: 'idle-client-error' })
})
export const db = drizzle(pool, { schema })
