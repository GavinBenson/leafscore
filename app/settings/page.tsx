import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { signOutAction } from '@/actions/auth'

export const metadata = {
  title: 'Settings',
}

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/settings'))

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="section-title">Settings</h1>

      {/* Profile info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              width={56}
              height={56}
              style={{ borderRadius: '50%' }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{user.name}</div>
            <div className="subtle">{user.email}</div>
          </div>
        </div>
      </div>

      {/* Premium status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              Subscription
            </div>
            {user.isPremium ? (
              <span className="tag tag-accent">Premium</span>
            ) : (
              <span className="tag">Free</span>
            )}
          </div>
          {!user.isPremium && (
            <a href="/settings/billing" className="btn btn-primary btn-sm">
              Upgrade to Premium
            </a>
          )}
        </div>
      </div>

      {/* Account actions */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          Account
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost">
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
