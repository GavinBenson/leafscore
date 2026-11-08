import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthSecret, getStripeSecretKey, getStripeWebhookSecret, parseEnv } from './env'

const full = {
  DATABASE_URL: 'postgres://u:p@h/db',
  AUTH_SECRET: 's',
  NEXT_PUBLIC_APP_URL: 'https://leafscore.app/',
  STRIPE_SECRET_KEY: 'sk_live_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_MONTHLY_PRICE_ID: 'price_1A',
  STRIPE_YEARLY_PRICE_ID: 'price_1B',
  BLOB_READ_WRITE_TOKEN: 't',
  AUTH_RESEND_KEY: 're_x',
  AUTH_GOOGLE_ID: 'g',
  AUTH_GOOGLE_SECRET: 'gs',
}

describe('parseEnv', () => {
  it('uses dev defaults outside production', () => {
    const { env, errors } = parseEnv({}, { production: false })
    expect(errors).toEqual([])
    expect(env.appUrl).toBe('http://localhost:3000')
  })
  it('accepts a complete production env and trims trailing slash', () => {
    const { env, errors } = parseEnv(full, { production: true })
    expect(errors).toEqual([])
    expect(env.appUrl).toBe('https://leafscore.app')
  })
  it('aggregates every production problem', () => {
    const { errors } = parseEnv(
      { STRIPE_MONTHLY_PRICE_ID: 'price_monthly', NEXT_PUBLIC_APP_URL: 'http://x' },
      { production: true },
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'DATABASE_URL is required',
        'AUTH_SECRET is required',
        'STRIPE_WEBHOOK_SECRET is required',
        'NEXT_PUBLIC_APP_URL must be an https:// URL in production',
        'STRIPE_MONTHLY_PRICE_ID must be a real Stripe price id',
        'BLOB_READ_WRITE_TOKEN is required',
      ]),
    )
  })
})

describe('per-feature getters', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('validate only their own variable in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_SECRET', 'real')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_real')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
    expect(getAuthSecret()).toBe('real')
    expect(getStripeWebhookSecret()).toBe('whsec_real')
    expect(() => getStripeSecretKey()).toThrow('STRIPE_SECRET_KEY is required')
  })
  it('throws for a missing secret in production and defaults in dev', () => {
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getAuthSecret()).toThrow('AUTH_SECRET is required')
    vi.stubEnv('NODE_ENV', 'test')
    expect(getAuthSecret()).toBe('dev-only-insecure-secret')
  })
})
