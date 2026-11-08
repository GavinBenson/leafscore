import { ImageResponse } from 'next/og'

export const ogSize = { width: 1200, height: 630 }

// Scores change, so don't use the ImageResponse default (immutable, one year).
const OG_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

/** Unknown id: a real 404 so crawlers don't cache a placeholder image. */
export function ogNotFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } })
}

/** Transient failure (e.g. database down): not cacheable. */
export function ogUnavailable() {
  return new Response('Image unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export function renderOg({
  title,
  subtitle,
  score,
}: {
  title: string
  subtitle?: string | null
  score?: number | null
}) {
  const shown = title.length > 80 ? `${title.slice(0, 77)}...` : title
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#f4f1e8',
          color: '#1f2a1c',
        }}
      >
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: '#3f6b3a' }}>
          LeafScore
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 800 }}>
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
              {shown}
            </div>
            {subtitle ? (
              <div style={{ display: 'flex', fontSize: 36, marginTop: 20, color: '#5a6657' }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {score != null ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 220,
                height: 220,
                borderRadius: 110,
                background: '#3f6b3a',
                color: '#ffffff',
                fontSize: 100,
                fontWeight: 700,
              }}
            >
              {Math.round(score)}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#5a6657' }}>
          Community tea ratings
        </div>
      </div>
    ),
    { ...ogSize, headers: { 'Cache-Control': OG_CACHE_CONTROL } },
  )
}
