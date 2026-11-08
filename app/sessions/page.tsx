import { redirect } from 'next/navigation'
import { signInPath } from '@/lib/authRedirect'
import { clampPage } from '@/lib/ids'
import { getCurrentUser } from '@/lib/session'
import { SessionsPanel } from '@/components/SessionsPanel'

export const metadata = {
  title: 'Brew sessions',
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; deleted?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/sessions'))

  const params = await searchParams
  const page = clampPage(params.page)

  return (
    <div>
      <h1 className="section-title">Brew sessions</h1>
      {params.deleted === '1' && (
        <p role="status" className="subtle" style={{ marginBottom: 12 }}>
          Session deleted.
        </p>
      )}
      <SessionsPanel
        userId={user.id}
        isPremium={user.isPremium}
        page={page}
        hrefFor={(p) => `/sessions${p > 1 ? `?page=${p}` : ''}`}
      />
    </div>
  )
}
