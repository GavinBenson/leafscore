import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://leafscore.app'
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/settings'] },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
