// Central, lazy environment validation. Nothing here runs at import time, so
// `next build` works without secrets. Call getEnv() from request-time code that needs the whole
// config; prefer the per-feature getters below.
export type Env = {
  production: boolean
  databaseUrl: string
  authSecret: string
  appUrl: string
  googleClientId: string | undefined
  googleClientSecret: string | undefined
  resendApiKey: string | undefined
  stripe: {
    secretKey: string
    webhookSecret: string
    monthlyPriceId: string
    yearlyPriceId: string
    trialDays: number
  }
  blobToken: string | undefined
  plausibleDomain: string | undefined
}

export type EnvParseResult = { env: Env; errors: string[] }

const PRICE_PLACEHOLDERS = new Set(['price_monthly', 'price_yearly'])

export function parseEnv(source: Record<string, string | undefined>, opts: { production: boolean }): EnvParseResult {
  const errors: string[] = []
  const { production } = opts
  const get = (k: string) => source[k]?.trim() || undefined

  function required(key: string, devDefault: string, check?: (v: string) => string | null): string {
    const v = get(key)
    if (!v) {
      if (production) errors.push(`${key} is required`)
      return devDefault
    }
    const problem = check?.(v)
    if (problem && production) errors.push(`${key} ${problem}`)
    return v
  }
  // Required only in production; optional (undefined) elsewhere.
  function requiredInProd(key: string): string | undefined {
    const v = get(key)
    if (!v && production) errors.push(`${key} is required`)
    return v
  }

  const databaseUrl = required('DATABASE_URL', 'postgres://localhost:5432/leafscore', (v) =>
    /^postgres(ql)?:\/\//.test(v) ? null : 'must be a postgres:// URL')

  let authSecret = get('AUTH_SECRET') ?? get('NEXTAUTH_SECRET')
  if (!authSecret) {
    if (production) errors.push('AUTH_SECRET is required')
    authSecret = 'dev-only-insecure-secret'
  }

  const appUrl = required('NEXT_PUBLIC_APP_URL', 'http://localhost:3000', (v) =>
    v.startsWith('https://') ? null : 'must be an https:// URL in production').replace(/\/+$/, '')

  const priceCheck = (v: string) =>
    v.startsWith('price_') && !PRICE_PLACEHOLDERS.has(v) ? null : 'must be a real Stripe price id'
  const stripe = {
    secretKey: required('STRIPE_SECRET_KEY', 'sk_test_dev'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET', 'whsec_dev'),
    monthlyPriceId: required('STRIPE_MONTHLY_PRICE_ID', 'price_monthly', priceCheck),
    yearlyPriceId: required('STRIPE_YEARLY_PRICE_ID', 'price_yearly', priceCheck),
    trialDays: parseTrialDays(get('STRIPE_TRIAL_DAYS'), production, errors),
  }

  return {
    env: {
      production,
      databaseUrl,
      authSecret,
      appUrl,
      googleClientId: requiredInProd('AUTH_GOOGLE_ID'),
      googleClientSecret: requiredInProd('AUTH_GOOGLE_SECRET'),
      resendApiKey: requiredInProd('AUTH_RESEND_KEY'),
      stripe,
      blobToken: requiredInProd('BLOB_READ_WRITE_TOKEN'),
      plausibleDomain: get('NEXT_PUBLIC_PLAUSIBLE_DOMAIN'),
    },
    errors,
  }
}

let cached: Env | null = null

/** Validated env. Throws one aggregated error in production; dev defaults elsewhere. */
export function getEnv(): Env {
  if (cached) return cached
  const production = process.env.NODE_ENV === 'production'
  const { env, errors } = parseEnv(process.env, { production })
  // During `next build` secrets may be absent; validation happens at request time.
  if (errors.length > 0 && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`)
  }
  if (errors.length === 0) cached = env
  return env
}

/** Boot diagnostics: the list of production problems, never throws. */
export function checkEnv(): string[] {
  return parseEnv(process.env, { production: process.env.NODE_ENV === 'production' }).errors
}

// Per-feature getters. Each validates only its own variable(s), so a missing
// unrelated variable (e.g. the Blob token) cannot break webhooks or unsubscribe.
function featureValue(keys: string[], devDefault: string, label = keys[0]): string {
  const v = keys.map((k) => process.env[k]?.trim()).find(Boolean)
  if (v) return v
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error(`Invalid environment configuration: ${label} is required`)
  }
  return devDefault
}

export function getAuthSecret(): string {
  return featureValue(['AUTH_SECRET', 'NEXTAUTH_SECRET'], 'dev-only-insecure-secret', 'AUTH_SECRET')
}

export function getStripeSecretKey(): string {
  return featureValue(['STRIPE_SECRET_KEY'], 'sk_test_dev')
}

export function getStripeWebhookSecret(): string {
  return featureValue(['STRIPE_WEBHOOK_SECRET'], 'whsec_dev')
}

/** Validates only the one price id; a placeholder or missing id fails in production. */
export function getStripePriceId(plan: 'monthly' | 'yearly'): string {
  const key = plan === 'monthly' ? 'STRIPE_MONTHLY_PRICE_ID' : 'STRIPE_YEARLY_PRICE_ID'
  const value = featureValue([key], plan === 'monthly' ? 'price_monthly' : 'price_yearly')
  const building = process.env.NEXT_PHASE === 'phase-production-build'
  if (
    process.env.NODE_ENV === 'production' &&
    !building &&
    (!value.startsWith('price_') || PRICE_PLACEHOLDERS.has(value))
  ) {
    throw new Error(`Invalid environment configuration: ${key} must be a real Stripe price id`)
  }
  return value
}

/** Free trial length; 0 (no trial) when unset or invalid, so it can never break checkout. */
export function getStripeTrialDays(): number {
  const errors: string[] = []
  const days = parseTrialDays(process.env.STRIPE_TRIAL_DAYS?.trim() || undefined, false, errors)
  return errors.length > 0 ? 0 : days
}

/** Test helper. */
export function resetEnvCache() {
  cached = null
}

// Integer 0-30; unset means no trial. An invalid value is an error in
// production and falls back to no trial elsewhere.
export function parseTrialDays(raw: string | undefined, production: boolean, errors: string[]): number {
  if (raw === undefined) return 0
  const n = Number(raw)
  if (/^\d+$/.test(raw) && n >= 0 && n <= 30) return n
  if (production) errors.push('STRIPE_TRIAL_DAYS must be an integer from 0 to 30')
  return 0
}
