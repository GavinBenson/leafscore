'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { signInPath } from '@/lib/authRedirect'

export function SignInButton() {
  const { data: session } = useSession()
  const pathname = usePathname()

  if (session?.user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/settings" aria-label="Account settings" style={{ display: 'flex' }}>
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name ?? ''}
              width={28}
              height={28}
              style={{ borderRadius: '50%' }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {(session.user.name ?? '?')[0].toUpperCase()}
            </div>
          )}
        </Link>
        <div className="account-details">
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {session.user.name}
          </span>
          <Link href="/settings" className="btn btn-ghost btn-sm">
            Settings
          </Link>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (pathname === '/signin') return null

  return (
    <Link href={signInPath(pathname)} className="btn btn-ghost btn-sm">
      Sign in
    </Link>
  )
}
