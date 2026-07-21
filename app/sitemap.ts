import { MetadataRoute } from 'next'
import { db } from '@/db/client'
import { listTeas } from '@/lib/data/teas'
import { listBrands } from '@/lib/data/brands'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://leafscore.app'

  const teas = await listTeas(db, { limit: 1000 })
  const brands = await listBrands(db)

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/browse`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...teas.map(tea => ({
      url: `${baseUrl}/browse/${tea.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...brands.map(brand => ({
      url: `${baseUrl}/brands/${brand.id}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
