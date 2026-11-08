import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTestDb } from './testDb'
import * as schema from './schema'
import { applyPlan, loadExisting, parseCsv, planImport, validateCsv } from './importer'

const HEADER = 'brand,name,type,subtype,origin,caffeine_level,leaf_style,website\n'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and comments', () => {
    const rows = parseCsv('﻿# c\r\na,"b, ""x""",c\r\n\r\nd,e,f')
    expect(rows.map((r) => r.cells)).toEqual([['a', 'b, "x"', 'c'], ['d', 'e', 'f']])
    expect(rows[0].line).toBe(2)
  })
})

describe('validateCsv', () => {
  it('accepts a valid row and normalises empties to null', () => {
    const { rows, errors } = validateCsv(HEADER + ' Twinings ,Earl  Grey,BLACK,,,,bag,')
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ brand: 'Twinings', name: 'Earl Grey', type: 'black', subtype: null, leafStyle: 'bag', website: null })
  })
  it('reports every bad field with its line', () => {
    const { rows, errors } = validateCsv(HEADER + 'A,B,coffee,,,huge,sack,ftp://x\n,,green,,,,,')
    expect(rows).toEqual([])
    expect(errors.filter((e) => e.line === 2)).toHaveLength(4)
    expect(errors.filter((e) => e.line === 3).map((e) => e.message)).toEqual(['brand is required', 'name is required'])
  })
  it('rejects missing required columns, unknown columns and short rows', () => {
    expect(validateCsv('brand,name\nA,B').errors[0].message).toMatch(/Missing required column.*type/)
    expect(validateCsv('brand,name,type,flavour\n').errors[0].message).toMatch(/Unknown column/)
    expect(validateCsv(HEADER + 'A,B,green').errors[0].message).toMatch(/Expected 8 fields/)
  })
  it('the bundled sample is valid and has no duplicates', () => {
    const { rows, errors } = validateCsv(readFileSync('db/data/teas.sample.csv', 'utf8'))
    expect(errors).toEqual([])
    expect(rows.length).toBeLessThanOrEqual(40)
    expect(planImport(rows, { brandNames: new Set(), teaKeys: new Set() }).duplicatesInFile).toEqual([])
  })
})

describe('planImport + applyPlan (PGlite)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  beforeAll(async () => {
    db = await createTestDb()
    const [b] = await db.insert(schema.brands).values({ name: 'Twinings' }).returning()
    await db.insert(schema.teas).values({ name: 'Earl Grey', brandId: b.id, type: 'black' })
  })

  it('dedupes against the database and within the file, case-insensitively', async () => {
    const csv = HEADER + [
      'twinings,earl grey,black,,,,,',
      'TWININGS,Lady Grey,black,,,,bag,',
      'Twinings,lady grey,black,,,,,',
      'New Brand,Tea One,green,sencha,Japan,medium,loose,https://example.com',
    ].join('\n')
    const { rows, errors } = validateCsv(csv)
    expect(errors).toEqual([])
    const plan = planImport(rows, await loadExisting(db))
    expect(plan.duplicatesExisting).toHaveLength(1)
    expect(plan.duplicatesInFile).toHaveLength(1)
    expect(plan.newBrands.map((b) => b.name)).toEqual(['New Brand'])
    expect(plan.newTeas.map((t) => t.name)).toEqual(['Lady Grey', 'Tea One'])

    const result = await applyPlan(db, plan)
    expect(result).toEqual({ brandsCreated: 1, teasCreated: 2 })
    const brands = await db.select().from(schema.brands)
    expect(brands.map((b) => b.name).sort()).toEqual(['New Brand', 'Twinings'])

    // Re-running is a no-op.
    const again = planImport(rows, await loadExisting(db))
    expect(again.newTeas).toEqual([])
    expect(again.newBrands).toEqual([])
  })
})
