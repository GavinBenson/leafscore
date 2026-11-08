import { neonConfig } from '@neondatabase/serverless'

/** Hosts that are never a hosted/production database. */
export const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'db.localtest.me']

export function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  const host = hostOf(url)
  return host !== null && LOCAL_HOSTS.includes(host)
}

/**
 * The Neon serverless driver speaks HTTP, so it cannot talk to a plain
 * Postgres. For local/CI databases we point it at the local-neon-http-proxy
 * (see .github/workflows/ci.yml), which listens on port 4444 of db.localtest.me
 * (a public DNS name that resolves to 127.0.0.1). No effect for real Neon URLs.
 */
export function configureLocalNeon(url: string | undefined = process.env.DATABASE_URL) {
  if (hostOf(url) !== 'db.localtest.me') return
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`
  neonConfig.useSecureWebSocket = false
  neonConfig.wsProxy = (host) => `${host}:4444/v1`
}
