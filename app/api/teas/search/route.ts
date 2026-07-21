import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { searchTeas } from '@/lib/data/teas'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q || q.length < 2) return NextResponse.json([])
  const results = await searchTeas(db, q, 10)
  return NextResponse.json(results)
}
