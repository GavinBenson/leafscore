import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined, fallback: string): string {
  try {
    return new URL(url?.trim() || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

// Analytics script origin (only when enabled), so the CSP allows exactly it.
const analyticsOrigin = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  ? origin(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC, "https://plausible.io/js/script.js")
  : null;
const analytics = analyticsOrigin ? [analyticsOrigin] : [];

// CSP decision: Next injects inline bootstrap/hydration scripts and the layout
// has an inline theme script. A nonce-based strict script-src needs a proxy
// (middleware) on every request, which makes all pages dynamic. So: enforce
// everything except a strict script-src (frame-ancestors, object-src, base-uri,
// img/connect/font/style limits), allow 'unsafe-inline' scripts in the enforced
// policy, and ship the strict `script-src 'self'` in Report-Only to measure.
const common = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Blob = review photos, lh3.googleusercontent.com = Google avatars.
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${analytics.join(" ")}`.trim(),
];

const enforcedCsp = [
  ...common,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${analytics.join(" ")}`.trim(),
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const reportOnlyCsp = [
  ...common,
  `script-src 'self' ${analytics.join(" ")}`.trim(),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: enforcedCsp },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Review photos are capped at 4MB; the rest is the other form fields.
      bodySizeLimit: "4.5mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
