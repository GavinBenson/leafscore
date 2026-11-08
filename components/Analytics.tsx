import Script from 'next/script'

// Privacy-friendly analytics (Plausible-compatible). Renders nothing unless
// NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set. Script origin defaults to
// https://plausible.io (override with NEXT_PUBLIC_PLAUSIBLE_SRC for self-host);
// next.config.ts adds that origin to the CSP.
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  if (!domain) return null
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim() || 'https://plausible.io/js/script.js'
  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />
}
