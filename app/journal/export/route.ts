import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/db/client'
import { signInPath } from '@/lib/authRedirect'
import { toCsv } from '@/lib/csv'
import { listReviewsForExport } from '@/lib/data/stats'
import { getCurrentUser } from '@/lib/session'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL(signInPath('/journal'), request.url))
  }
  if (!user.isPremium) {
    return NextResponse.redirect(new URL('/settings/billing?from=export', request.url))
  }

  const rows = await listReviewsForExport(db, user.id)
  // Temperatures stay in Celsius whatever the user's display unit, so the file
  // is machine-readable and stable; the header names the unit.
  const csv = toCsv(
    ['Date', 'Tea', 'Type', 'Brand', 'Score', 'Brew method', 'Temperature (C)', 'Steep time (s)', 'Would drink again', 'Flavors', 'Notes', 'Hidden by moderators'],
    rows.map((row) => [
      row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : null,
      row.tea,
      row.type,
      row.brand,
      row.score,
      row.brewMethod,
      row.brewTemp,
      row.steepTime,
      row.wouldDrinkAgain,
      row.flavors,
      row.notes,
      row.hidden ? 'yes' : '',
    ]),
  )

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leafscore-journal.csv"',
    },
  })
}
