import Link from 'next/link'
import { verifyToken } from '@/lib/unsubscribeToken'

export const metadata = {
  title: 'Unsubscribe',
  robots: { index: false },
}
export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const { token, done } = await searchParams
  const valid = verifyToken(token) !== null

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 className="section-title">Weekly digest</h1>
      {done === '1' ? (
        <div className="card" role="status">
          <p style={{ margin: 0 }}>You are unsubscribed. You will not get the weekly digest anymore.</p>
        </div>
      ) : valid && token ? (
        <div className="card">
          <p style={{ margin: '0 0 12px' }}>Stop the weekly email of new top teas?</p>
          <form method="POST" action={`/unsubscribe/one-click?token=${encodeURIComponent(token)}`}>
            <input type="hidden" name="page" value="1" />
            <button type="submit" className="btn btn-primary">
              Unsubscribe
            </button>
          </form>
        </div>
      ) : (
        <div className="card" role="alert">
          <p style={{ margin: 0 }}>
            This unsubscribe link is not valid. You can turn the digest off any time in{' '}
            <Link href="/settings">Settings</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
