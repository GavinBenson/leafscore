import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { getBrandWithTeas, listBrands } from './brands'
import { getTagsForReview, listFlavorTags } from './flavorTags'
import { createReview } from './reviews'
import { getTea, getTeaWithDetails, listTeas, searchTeas } from './teas'

describe('catalog', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>

  beforeEach(async () => {
    db = await createTestDb()
  })

  describe('teas', () => {
    beforeEach(async () => {
      await seedTestTea(db, { name: 'Assam', type: 'black', leafScore: 50 })
      await seedTestTea(db, { name: 'Sencha', type: 'green', leafScore: 90 })
      await seedTestTea(db, { name: '100% Matcha_Grade', type: 'green', leafScore: 70 })
    })

    const names = (rows: { name: string }[]) => rows.map((row) => row.name)

    it('sorts by score by default, or by name', async () => {
      expect(names(await listTeas(db))).toEqual(['Sencha', '100% Matcha_Grade', 'Assam'])
      expect(names(await listTeas(db, { sort: 'name' }))).toEqual(['100% Matcha_Grade', 'Assam', 'Sencha'])
    })

    it('filters by type and by name, ignoring case, with paging', async () => {
      expect(names(await listTeas(db, { type: 'black' }))).toEqual(['Assam'])
      expect(names(await listTeas(db, { search: 'SEN' }))).toEqual(['Sencha'])
      expect(names(await listTeas(db, { type: 'green', search: 'sen' }))).toEqual(['Sencha'])
      expect(names(await listTeas(db, { limit: 1, offset: 1 }))).toEqual(['100% Matcha_Grade'])
    })

    it('treats % and _ in a search as literal text', async () => {
      expect(names(await searchTeas(db, '%'))).toEqual(['100% Matcha_Grade'])
      expect(names(await searchTeas(db, 'a_g'))).toEqual(['100% Matcha_Grade'])
      expect(names(await searchTeas(db, 'S_ncha'))).toEqual([])
    })

    it('returns null for a missing tea', async () => {
      expect(await getTea(db, 9999)).toBeNull()
      expect(await getTeaWithDetails(db, 9999)).toBeNull()
    })

    it('gathers the brand, reviews and links for a tea', async () => {
      const [brand] = await db.insert(schema.brands).values({ name: 'Rishi' }).returning()
      const tea = await seedTestTea(db, { name: 'Detail', brandId: brand.id })
      const user = await seedTestUser(db)
      await createReview(db, { userId: user.id, teaId: tea.id, score: 85 })
      await db.insert(schema.affiliateLinks).values({ teaId: tea.id, provider: 'Shop', url: 'https://x' })

      const details = await getTeaWithDetails(db, tea.id)

      expect(details?.brand?.name).toBe('Rishi')
      expect(details?.reviews[0].user.name).toBe('Test User')
      expect(details?.affiliateLinks[0].provider).toBe('Shop')
    })
  })

  it('lists brands by name and gathers a brand with its teas', async () => {
    const [zed] = await db.insert(schema.brands).values({ name: 'Zed' }).returning()
    await db.insert(schema.brands).values({ name: 'Ace' })
    await seedTestTea(db, { name: 'Zed Tea', brandId: zed.id })
    await seedTestTea(db, { name: 'Unbranded' })

    expect((await listBrands(db)).map((brand) => brand.name)).toEqual(['Ace', 'Zed'])
    const result = await getBrandWithTeas(db, zed.id)
    expect(result?.teas.map((tea) => tea.name)).toEqual(['Zed Tea'])
    expect(await getBrandWithTeas(db, 9999)).toBeNull()
  })

  it('lists flavor tags by category and finds the tags on a review', async () => {
    const tags = await db
      .insert(schema.flavorTags)
      .values([
        { name: 'smoky', category: 'other' },
        { name: 'rose', category: 'floral' },
      ])
      .returning()
    expect((await listFlavorTags(db)).map((tag) => tag.name)).toEqual(['rose', 'smoky'])

    const user = await seedTestUser(db)
    const tea = await seedTestTea(db)
    const review = await createReview(db, { userId: user.id, teaId: tea.id, score: 50 }, [tags[0].id])
    expect((await getTagsForReview(db, review.id)).map((tag) => tag.name)).toEqual(['smoky'])
  })
})
