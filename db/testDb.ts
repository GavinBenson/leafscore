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

export async function seedTestUser(
  db: PgliteDatabase<typeof schema>,
  email = 'test@example.com',
) {
  const [user] = await db.insert(schema.users).values({
    name: 'Test User',
    email,
  }).returning()
  return user
}

export async function seedTestTea(
  db: PgliteDatabase<typeof schema>,
  values: Partial<schema.NewTea> = {},
) {
  const [tea] = await db.insert(schema.teas).values({
    name: 'Test Tea',
    type: 'green',
    ...values,
  }).returning()
  return tea
}
