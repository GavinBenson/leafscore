import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { listLinkedProviders } from '@/lib/data/users'
import { createAdapter } from './authAdapter'

// These are the methods whose absence broke every /api/auth route (PBI 1).
describe('auth adapter', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let adapter: ReturnType<typeof createAdapter>

  beforeEach(async () => {
    db = await createTestDb()
    adapter = createAdapter(db)
  })

  it('implements every method Auth.js requires for Google and magic links', () => {
    for (const method of [
      'createUser',
      'getUser',
      'getUserByEmail',
      'getUserByAccount',
      'updateUser',
      'linkAccount',
      'createVerificationToken',
      'useVerificationToken',
    ] as const) {
      expect(adapter[method], method).toBeTypeOf('function')
    }
  })

  it('creates a user, falling back to a neutral name that does not leak the email', async () => {
    const user = await adapter.createUser!({
      id: 'ignored',
      email: 'new@example.com',
      emailVerified: null,
      name: null,
    })

    expect(user.name).toMatch(/^Tea drinker \d{4}$/)
    expect(user.name).not.toContain('new@')
    expect(user.email).toBe('new@example.com')
    expect(user.id).toMatch(/^\d+$/)
  })

  it('finds users by id and email, and returns null when missing or malformed', async () => {
    const seeded = await seedTestUser(db)

    expect((await adapter.getUser!(String(seeded.id)))?.email).toBe('test@example.com')
    expect((await adapter.getUserByEmail!('test@example.com'))?.id).toBe(String(seeded.id))
    expect(await adapter.getUser!('9999')).toBeNull()
    expect(await adapter.getUser!('not-a-number')).toBeNull()
    expect(await adapter.getUserByEmail!('nobody@example.com')).toBeNull()
  })

  it('updates only the given fields', async () => {
    const seeded = await seedTestUser(db)

    const user = await adapter.updateUser!({ id: String(seeded.id), image: 'https://x/a.png' })

    expect(user.name).toBe('Test User')
    expect(user.image).toBe('https://x/a.png')
    await expect(adapter.updateUser!({ id: '9999', name: 'x' })).rejects.toThrow('not found')
  })

  describe('OAuth accounts', () => {
    const account = { provider: 'google', providerAccountId: 'g-123', type: 'oidc' as const }

    it('finds nobody before linking and the user after', async () => {
      const seeded = await seedTestUser(db)
      const lookup = { provider: 'google', providerAccountId: 'g-123' }
      expect(await adapter.getUserByAccount!(lookup)).toBeNull()

      await adapter.linkAccount!({ ...account, userId: String(seeded.id) })

      expect((await adapter.getUserByAccount!(lookup))?.id).toBe(String(seeded.id))
    })

    it('matches on both provider and account id', async () => {
      const seeded = await seedTestUser(db)
      await adapter.linkAccount!({ ...account, userId: String(seeded.id) })

      expect(await adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'other' })).toBeNull()
      expect(await adapter.getUserByAccount!({ provider: 'github', providerAccountId: 'g-123' })).toBeNull()
    })

    it('still finds the user after their email changes', async () => {
      const seeded = await seedTestUser(db)
      await adapter.linkAccount!({ ...account, userId: String(seeded.id) })
      await db.update(schema.users).set({ email: 'renamed@example.com' }).where(eq(schema.users.id, seeded.id))

      const found = await adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'g-123' })
      expect(found?.email).toBe('renamed@example.com')
    })

    it('tolerates linking twice and does not store tokens', async () => {
      const seeded = await seedTestUser(db)
      const withTokens = { ...account, userId: String(seeded.id), access_token: 'secret', id_token: 'secret' }
      await adapter.linkAccount!(withTokens)
      await adapter.linkAccount!(withTokens)

      const rows = await db.select().from(schema.accounts)
      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows)).not.toContain('secret')
      expect(await listLinkedProviders(db, seeded.id)).toEqual(['google'])
    })
  })

  it('consumes a verification token exactly once', async () => {
    const token = { identifier: 'a@example.com', token: 'abc', expires: new Date('2030-01-01T00:00:00Z') }
    await adapter.createVerificationToken!(token)

    expect(await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'wrong' })).toBeNull()
    expect(await adapter.useVerificationToken!({ identifier: 'b@example.com', token: 'abc' })).toBeNull()
    expect((await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'abc' }))?.expires).toEqual(token.expires)
    expect(await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'abc' })).toBeNull()
  })
})
