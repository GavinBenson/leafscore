import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { formatTemperature, type TemperatureUnit } from '@/lib/units'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** A figure needs at least this many reviews that carry the field. */
export const MIN_BREW_REVIEWS = 3

export type BrewRange = {
  median: number
  q1: number
  q3: number
  /** Number of non-hidden reviews that have this field. */
  count: number
}

export type BrewGuide = {
  /** Degrees Celsius, whole degrees. */
  temperature: BrewRange | null
  /** Seconds, whole seconds. */
  time: BrewRange | null
  method: { method: string; count: number; share: number; total: number } | null
}

export const EMPTY_BREW_GUIDE: BrewGuide = { temperature: null, time: null, method: null }

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function range(
  count: unknown,
  q1: unknown,
  median: unknown,
  q3: unknown,
): BrewRange | null {
  const n = num(count) ?? 0
  const a = num(q1)
  const m = num(median)
  const b = num(q3)
  if (n < MIN_BREW_REVIEWS || a === null || m === null || b === null) return null
  return { median: Math.round(m), q1: Math.round(a), q3: Math.round(b), count: n }
}

const r = schema.reviews

/**
 * One statement per tea over non-hidden reviews. Medians and quartiles use
 * percentile_cont (continuous, interpolated; NULL inputs are ignored), which
 * works on Postgres and PGlite. Zero or negative values are treated as missing
 * so a stray 0 cannot drag a median. The most common method breaks ties by name
 * so the result is deterministic.
 */
export async function getBrewGuide(db: Db, teaId: number): Promise<BrewGuide> {
  const visible = and(eq(r.teaId, teaId), eq(r.hidden, false))
  const topMethod = sql`(select ${r.brewMethod} from ${r} where ${r.teaId} = ${teaId} and not ${r.hidden} and ${r.brewMethod} is not null group by ${r.brewMethod} order by count(*) desc, ${r.brewMethod} asc limit 1)`
  const topMethodCount = sql`(select count(*) from ${r} where ${r.teaId} = ${teaId} and not ${r.hidden} and ${r.brewMethod} = ${topMethod})`

  const [row] = await db
    .select({
      tempN: sql<string>`count(${r.brewTemp}) filter (where ${r.brewTemp} > 0)`,
      tempQ1: sql<number | null>`percentile_cont(0.25) within group (order by ${r.brewTemp}) filter (where ${r.brewTemp} > 0)`,
      tempMed: sql<number | null>`percentile_cont(0.5) within group (order by ${r.brewTemp}) filter (where ${r.brewTemp} > 0)`,
      tempQ3: sql<number | null>`percentile_cont(0.75) within group (order by ${r.brewTemp}) filter (where ${r.brewTemp} > 0)`,
      timeN: sql<string>`count(${r.steepTime}) filter (where ${r.steepTime} > 0)`,
      timeQ1: sql<number | null>`percentile_cont(0.25) within group (order by ${r.steepTime}) filter (where ${r.steepTime} > 0)`,
      timeMed: sql<number | null>`percentile_cont(0.5) within group (order by ${r.steepTime}) filter (where ${r.steepTime} > 0)`,
      timeQ3: sql<number | null>`percentile_cont(0.75) within group (order by ${r.steepTime}) filter (where ${r.steepTime} > 0)`,
      methodTotal: sql<string>`count(${r.brewMethod})`,
      method: sql<string | null>`${topMethod}`,
      methodCount: sql<string | null>`${topMethodCount}`,
    })
    .from(r)
    .where(visible)

  if (!row) return EMPTY_BREW_GUIDE

  const total = num(row.methodTotal) ?? 0
  const topCount = num(row.methodCount) ?? 0
  const method =
    row.method && total >= MIN_BREW_REVIEWS
      ? { method: row.method, count: topCount, share: topCount / total, total }
      : null

  return {
    temperature: range(row.tempN, row.tempQ1, row.tempMed, row.tempQ3),
    time: range(row.timeN, row.timeQ1, row.timeMed, row.timeQ3),
    method,
  }
}

export function hasBrewGuideData(guide: BrewGuide): boolean {
  return Boolean(guide.temperature || guide.time || guide.method)
}

const METHOD_LABELS: Record<string, string> = {
  gongfu: 'gongfu',
  western: 'western',
  cold_brew: 'cold brew',
  grandpa: 'grandpa style',
}

export function brewMethodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.replace(/_/g, ' ')
}

/** 45 -> "45 s", 180 -> "3 min", 210 -> "3 min 30 s", 28800 -> "8 h". */
export function formatSteepTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const rest = s % 60
    return rest === 0 ? `${m} min` : `${m} min ${rest} s`
  }
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Reviews behind the guide: the largest count among the figures shown. */
export function brewGuideReviewCount(guide: BrewGuide): number {
  return Math.max(guide.temperature?.count ?? 0, guide.time?.count ?? 0, guide.method?.total ?? 0)
}

/**
 * One-line summary, e.g. "Most drinkers brew this at 95°C for 3 min · gongfu ·
 * based on 12 reviews". Null when there is nothing to say.
 */
export function brewGuideSummary(guide: BrewGuide, unit: TemperatureUnit = 'c'): string | null {
  if (!hasBrewGuideData(guide)) return null
  const parts: string[] = []
  const when: string[] = []
  if (guide.temperature) when.push(`at ${formatTemperature(guide.temperature.median, unit)}`)
  if (guide.time) when.push(`for ${formatSteepTime(guide.time.median)}`)
  if (when.length > 0) parts.push(`Most drinkers brew this ${when.join(' ')}`)
  if (guide.method) {
    const label = brewMethodLabel(guide.method.method)
    parts.push(parts.length === 0 ? `Most drinkers brew this ${label}` : label)
  }
  const n = brewGuideReviewCount(guide)
  parts.push(`based on ${n} ${n === 1 ? 'review' : 'reviews'}`)
  return parts.join(' · ')
}
