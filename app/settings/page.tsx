import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { getUserById, listLinkedProviders } from '@/lib/data/users'
import { updateProfileVisibility } from '@/actions/profile'
import { updateDigestPreference } from '@/actions/digest'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { signOutAction } from '@/actions/auth'
import { DisplayNameForm } from '@/components/DisplayNameForm'
import { DeleteAccountForm } from '@/components/DeleteAccountForm'
import { PreferencesForm } from '@/components/PreferencesForm'

export const metadata = {
  title: 'Settings',
}

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/settings'))

  const [account, providers] = await Promise.all([
    getUserById(db, user.id),
    listLinkedProviders(db, user.id),
  ])
  const isPublic = account?.profilePublic ?? true

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="section-title">Settings</h1>

      {/* Profile info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name}
              width={56}
              height={56}
              unoptimized
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

      {/* Display name */}
      <div className="card" style={{ marginBottom: 16 }}>
        <DisplayNameForm currentName={account?.name ?? user.name} />
      </div>

      {/* Units and blind tasting */}
      <div className="card" style={{ marginBottom: 16 }}>
        <PreferencesForm
          tempUnit={account?.tempUnit ?? 'c'}
          weightUnit={account?.weightUnit ?? 'g'}
          blindTasting={account?.blindTasting ?? false}
        />
      </div>

      {/* Profile privacy */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          Public profile
        </div>
        <p className="subtle" style={{ margin: '0 0 12px' }}>
          {isPublic
            ? 'Anyone can see your profile page, with your reviews and favorites.'
            : 'Your profile page is hidden. Your reviews still appear on tea pages under your name.'}
        </p>
        <p className="subtle" style={{ margin: '0 0 12px' }}>
          New accounts start with a public profile. Making it private hides your profile page only;
          your reviews stay visible on tea pages under your display name.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <form action={updateProfileVisibility}>
            <input type="hidden" name="profilePublic" value={isPublic ? 'false' : 'true'} />
            <button type="submit" className="btn btn-outline btn-sm">
              {isPublic ? 'Make private' : 'Make public'}
            </button>
          </form>
          <Link href={`/u/${user.id}`} className="btn btn-ghost btn-sm">
            View profile
          </Link>
        </div>
      </div>

      {/* Email preferences */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Email</div>
        <form action={updateDigestPreference}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
            <input
              type="checkbox"
              name="digestOptIn"
              defaultChecked={account?.digestOptIn ?? false}
              aria-describedby="digest-help"
              style={{ marginTop: 4 }}
            />
            <span>Email me a weekly digest of new top teas</span>
          </label>
          <p id="digest-help" className="subtle" style={{ margin: '4px 0 12px' }}>
            At most one email a week, only when there is something new. Off by default; every email
            has an unsubscribe link.
          </p>
          <button type="submit" className="btn btn-outline btn-sm">
            Save email preference
          </button>
        </form>
      </div>

      {/* Sign-in methods */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
          Sign-in methods
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span>Google</span>
          {providers.includes('google') ? (
            <span className="tag tag-accent">Connected</span>
          ) : (
            <span className="tag">Connects next time you use it</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>Email link</span>
          <span className="subtle" style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{user.email}</span>
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

      {/* Your data */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Your data</div>
        <p className="subtle" style={{ margin: '0 0 12px' }}>
          Download a JSON copy of your profile, reviews, favorites and wishlist. Available to everyone.
        </p>
        <a href="/api/account/export" download className="btn btn-outline btn-sm">
          Download my data
        </a>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ marginTop: 16 }}>
        <DeleteAccountForm hasSubscription={!!account?.stripeCustomerId} />
      </div>
    </div>
  )
}
