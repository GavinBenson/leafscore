import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/siteUrl'
import { getSitemapRowsCached } from '@/lib/cache'
import { listSitemapEntries } from '@/lib/data/listSeo'

// Not baked forever: regenerate at least hourly (and on tag invalidation).
export const revalidate = 3600

// One sitemap file may hold 50,000 URLs; leave room for static and brand routes.
// If the catalogue outgrows this, switch to generateSitemaps (and list each
// /sitemap/[id].xml in robots.ts).
const MAX_TEAS = 45_000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteUrl()
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/browse`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/lists`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${baseUrl}/brands`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  try {
    // Tagged data cache (lib/cache.ts); values are JSON, so dates are strings.
    const { teas, brands, lists } = await getSitemapRowsCached(MAX_TEAS)

    return [
      ...staticRoutes,
      ...teas.map((tea) => ({
        url: `${baseUrl}/browse/${tea.id}`,
        lastModified: tea.lastReviewAt ? new Date(tea.lastReviewAt) : (tea.createdAt ? new Date(tea.createdAt) : undefined),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
      ...listSitemapEntries(lists, baseUrl),
      ...brands.map((brand) => ({
        url: `${baseUrl}/brands/${brand.id}`,
        lastModified: brand.createdAt ? new Date(brand.createdAt) : undefined,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ]
  } catch (error) {
    // At runtime (production) rethrow: a failed revalidation keeps serving the
    // last good sitemap instead of caching a 200 with only static routes for the
    // whole revalidate window. During `next build` (and in dev) the database may
    // be unreachable, so fall back to the static routes there.
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      throw error
    }
    return staticRoutes
  }
}
