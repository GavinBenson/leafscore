import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { db } from '@/db/client'
import { getUserById } from '@/lib/data/users'
import { PLANS } from '@/lib/stripe'
import { PremiumFeatureList } from '@/components/PremiumUpsell'
import { SubscribeButton } from '@/components/SubscribeButton'

export const metadata = {
  title: 'Billing',
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/settings/billing'))

  const { success } = await searchParams
  const account = await getUserById(db, user.id)

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="section-title">Billing</h1>

      {account?.paymentFailedAt && user.isPremium && (
        <p className="form-error" role="alert">
          Your last payment failed. Update your card under Manage Subscription to keep Premium.
        </p>
      )}

      {success === 'true' && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
            borderColor: 'var(--color-primary)',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
            Welcome to Premium! Your subscription is now active.
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
          Current Plan
        </div>
        {user.isPremium ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="tag tag-accent">Premium</span>
            <form action="/api/stripe/portal" method="POST">
              <button type="submit" className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--color-line)' }}>
                Manage Subscription
              </button>
            </form>
          </div>
        ) : (
          <span className="tag">Free</span>
        )}
        {user.isPremium && account?.premiumExpiresAt && (
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            Current period ends {account.premiumExpiresAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })}
          </p>
        )}
      </div>

      {/* What Premium includes */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
          {user.isPremium ? 'Your Premium includes' : 'Premium includes'}
        </div>
        <PremiumFeatureList />
      </div>

      {/* Plan cards */}
      {!user.isPremium && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {/* Monthly */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-serif)' }}>
              {PLANS.monthly.name}
            </div>
            <div>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
                ${PLANS.monthly.price}
              </span>
              <span className="subtle">/mo</span>
            </div>
            <SubscribeButton plan="monthly" />
          </div>

          {/* Yearly */}
          <div
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderColor: 'var(--color-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-serif)' }}>
                {PLANS.yearly.name}
              </span>
              <span
                className="tag tag-accent"
                style={{ fontSize: 11 }}
              >
                Save 33%
              </span>
            </div>
            <div>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
                ${PLANS.yearly.price}
              </span>
              <span className="subtle">/yr</span>
            </div>
            <SubscribeButton plan="yearly" />
          </div>
        </div>
      )}
    </div>
  )
}
