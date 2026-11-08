// Display preferences of the person viewing a page (PBI 42/43). These are read
// from the database per request (never from a shared cache, never from the
// JWT), because they are per-user and can change without signing in again.
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from '@/db/schema'
import { getUserById } from '@/lib/data/users'
import type { TemperatureUnit, WeightUnit } from '@/lib/units'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type ViewerPreferences = {
  tempUnit: TemperatureUnit
  weightUnit: WeightUnit
  blindTasting: boolean
}

/** What signed-out visitors, and users who never chose, get. */
export const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  tempUnit: 'c',
  weightUnit: 'g',
  blindTasting: false,
}

export async function getViewerPreferences(db: Db, userId: number | null): Promise<ViewerPreferences> {
  if (userId === null) return DEFAULT_VIEWER_PREFERENCES
  const user = await getUserById(db, userId)
  if (!user) return DEFAULT_VIEWER_PREFERENCES
  return { tempUnit: user.tempUnit, weightUnit: user.weightUnit, blindTasting: user.blindTasting }
}
