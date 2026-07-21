import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from './schema'

export async function createTestDb(): Promise<PgliteDatabase<typeof schema>> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db
}

export async function seedTestUser(db: PgliteDatabase<typeof schema>) {
  const [user] = await db.insert(schema.users).values({
    name: 'Test User',
    email: 'test@example.com',
  }).returning()
  return user
}
