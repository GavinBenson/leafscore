import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const TEA_TYPES = ['green', 'black', 'white', 'oolong', 'puerh', 'herbal', 'mate', 'rooibos'] as const
export const CAFFEINE_LEVELS = ['low', 'medium', 'high'] as const
export const LEAF_STYLES = ['loose', 'bag', 'cake', 'powder'] as const

export const CSV_COLUMNS = ['brand', 'name', 'type', 'subtype', 'origin', 'caffeine_level', 'leaf_style', 'website'] as const
const REQUIRED = ['brand', 'name', 'type'] as const

export type ImportRow = {
  line: number
  brand: string
  name: string
  type: string
  subtype: string | null
  origin: string | null
  caffeineLevel: (typeof CAFFEINE_LEVELS)[number] | null
  leafStyle: (typeof LEAF_STYLES)[number] | null
  website: string | null
}

export type RowError = { line: number; message: string }

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, BOM, `#` comment lines. */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = []
  const src = text.replace(/^﻿/, '')
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let startLine = 1
  let atLineStart = true
  const pushRow = () => {
    cells.push(cell)
    const blank = cells.length === 1 && cells[0].trim() === ''
    if (!blank) out.push({ line: startLine, cells })
    cells = []
    cell = ''
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (atLineStart && !quoted && c === '#') {
      while (i < src.length && src[i] !== '\n') i++
      line++
      startLine = line
      continue
    }
    atLineStart = false
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else {
        if (c === '\n') line++
        cell += c
      }
    } else if (c === '"' && cell === '') {
      quoted = true
    } else if (c === ',') {
      cells.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      pushRow()
      line++
      startLine = line
      atLineStart = true
    } else {
      cell += c
    }
  }
  if (cell !== '' || cells.length > 0) pushRow()
  return out
}

const clean = (s: string | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')
export const keyOf = (brand: string, name: string) =>
  `${clean(brand).toLowerCase()}\u0000${clean(name).toLowerCase()}`

function validUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateCsv(text: string): { rows: ImportRow[]; errors: RowError[] } {
  const records = parseCsv(text)
  const errors: RowError[] = []
  const rows: ImportRow[] = []
  if (records.length === 0) return { rows, errors: [{ line: 1, message: 'File is empty' }] }

  const header = records[0].cells.map((h) => clean(h).toLowerCase())
  const missing = REQUIRED.filter((c) => !header.includes(c))
  const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h))
  if (missing.length || unknown.length) {
    if (missing.length) errors.push({ line: records[0].line, message: `Missing required column(s): ${missing.join(', ')}` })
    if (unknown.length) errors.push({ line: records[0].line, message: `Unknown column(s): ${unknown.join(', ')}` })
    return { rows, errors }
  }

  for (const rec of records.slice(1)) {
    if (rec.cells.length !== header.length) {
      errors.push({ line: rec.line, message: `Expected ${header.length} fields, found ${rec.cells.length}` })
      continue
    }
    const get = (col: string) => clean(rec.cells[header.indexOf(col)])
    const problems: string[] = []
    const brand = get('brand')
    const name = get('name')
    const type = get('type').toLowerCase()
    const caffeine = get('caffeine_level').toLowerCase()
    const leaf = get('leaf_style').toLowerCase()
    const website = get('website')
    if (!brand) problems.push('brand is required')
    if (!name) problems.push('name is required')
    if (brand.length > 120) problems.push('brand is longer than 120 characters')
    if (name.length > 200) problems.push('name is longer than 200 characters')
    if (!(TEA_TYPES as readonly string[]).includes(type)) problems.push(`type "${type}" must be one of ${TEA_TYPES.join(', ')}`)
    if (caffeine && !(CAFFEINE_LEVELS as readonly string[]).includes(caffeine))
      problems.push(`caffeine_level "${caffeine}" must be one of ${CAFFEINE_LEVELS.join(', ')} or empty`)
    if (leaf && !(LEAF_STYLES as readonly string[]).includes(leaf))
      problems.push(`leaf_style "${leaf}" must be one of ${LEAF_STYLES.join(', ')} or empty`)
    if (website && !validUrl(website)) problems.push(`website "${website}" is not an http(s) URL`)
    if (problems.length) {
      for (const message of problems) errors.push({ line: rec.line, message })
      continue
    }
    rows.push({
      line: rec.line,
      brand,
      name,
      type,
      subtype: get('subtype') || null,
      origin: get('origin') || null,
      caffeineLevel: (caffeine || null) as ImportRow['caffeineLevel'],
      leafStyle: (leaf || null) as ImportRow['leafStyle'],
      website: website || null,
    })
  }
  return { rows, errors }
}

export type ImportPlan = {
  newBrands: { name: string; website: string | null }[]
  newTeas: ImportRow[]
  duplicatesInFile: ImportRow[]
  duplicatesExisting: ImportRow[]
}

export type Existing = { brandNames: Set<string>; teaKeys: Set<string> }

export async function loadExisting(db: Db): Promise<Existing> {
  const brands = await db.select({ name: schema.brands.name }).from(schema.brands)
  const teas = await db
    .select({ name: schema.teas.name, brandName: schema.brands.name })
    .from(schema.teas)
    .innerJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
  return {
    brandNames: new Set(brands.map((b) => clean(b.name).toLowerCase())),
    teaKeys: new Set(teas.map((t) => keyOf(t.brandName, t.name))),
  }
}

/** Pure: decides what would be created. Brands are matched by lowercase name in code. */
export function planImport(rows: ImportRow[], existing: Existing): ImportPlan {
  const plan: ImportPlan = { newBrands: [], newTeas: [], duplicatesInFile: [], duplicatesExisting: [] }
  const seen = new Set<string>()
  const brandSeen = new Set(existing.brandNames)
  for (const row of rows) {
    const key = keyOf(row.brand, row.name)
    if (seen.has(key)) {
      plan.duplicatesInFile.push(row)
      continue
    }
    seen.add(key)
    if (existing.teaKeys.has(key)) {
      plan.duplicatesExisting.push(row)
      continue
    }
    const bKey = row.brand.toLowerCase()
    if (!brandSeen.has(bKey)) {
      brandSeen.add(bKey)
      plan.newBrands.push({ name: row.brand, website: row.website })
    }
    plan.newTeas.push(row)
  }
  return plan
}

export async function applyPlan(db: Db, plan: ImportPlan): Promise<{ brandsCreated: number; teasCreated: number }> {
  // Look brands up by lowercase name in code so this works with or without a unique constraint.
  const all = await db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands)
  const ids = new Map(all.map((b) => [clean(b.name).toLowerCase(), b.id]))
  let brandsCreated = 0
  for (const b of plan.newBrands) {
    if (ids.has(b.name.toLowerCase())) continue
    const [row] = await db
      .insert(schema.brands)
      .values({ name: b.name, website: b.website })
      .returning({ id: schema.brands.id })
    ids.set(b.name.toLowerCase(), row.id)
    brandsCreated++
  }
  const values = plan.newTeas.map((t) => ({
    name: t.name,
    brandId: ids.get(t.brand.toLowerCase())!,
    type: t.type,
    subtype: t.subtype,
    origin: t.origin,
    caffeineLevel: t.caffeineLevel,
    leafStyle: t.leafStyle,
  }))
  for (let i = 0; i < values.length; i += 100) {
    await db.insert(schema.teas).values(values.slice(i, i + 100))
  }
  return { brandsCreated, teasCreated: values.length }
}

export function summarize(valid: number, errors: RowError[], plan: ImportPlan): string {
  const invalid = new Set(errors.map((e) => e.line)).size
  return [
    `Rows read: ${valid + invalid}`,
    `Valid rows: ${valid}`,
    `Invalid rows: ${invalid}`,
    `Duplicates within file (skipped): ${plan.duplicatesInFile.length}`,
    `Already in database (skipped): ${plan.duplicatesExisting.length}`,
    `New brands: ${plan.newBrands.length}`,
    `New teas: ${plan.newTeas.length}`,
  ].join('\n')
}
