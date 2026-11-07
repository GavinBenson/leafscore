import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, seedTestUser } from '@/db/testDb'
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

  it('creates a user, falling back to the email for a name', async () => {
    const user = await adapter.createUser!({
      id: 'ignored',
      email: 'new@example.com',
      emailVerified: null,
      name: null,
    })

    expect(user.name).toBe('new')
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

  it('consumes a verification token exactly once', async () => {
    const token = { identifier: 'a@example.com', token: 'abc', expires: new Date('2030-01-01T00:00:00Z') }
    await adapter.createVerificationToken!(token)

    expect(await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'wrong' })).toBeNull()
    expect(await adapter.useVerificationToken!({ identifier: 'b@example.com', token: 'abc' })).toBeNull()
    expect((await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'abc' }))?.expires).toEqual(token.expires)
    expect(await adapter.useVerificationToken!({ identifier: 'a@example.com', token: 'abc' })).toBeNull()
  })
})
