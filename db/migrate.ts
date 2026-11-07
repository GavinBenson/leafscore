import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

async function main() {
  const client = neon(process.env.DATABASE_URL!)
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
