import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { signInPath } from '@/lib/authRedirect'
import { TeaRequestForm } from '@/components/TeaRequestForm'
import { MAX_REQUEST_NAME_LENGTH } from '@/lib/validation/teaRequest'

export const metadata = {
  title: 'Request a tea',
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string | string[] }>
}) {
  const sp = await searchParams
  const rawName = Array.isArray(sp.name) ? sp.name[0] : sp.name
  const name = (rawName ?? '').trim().slice(0, MAX_REQUEST_NAME_LENGTH)

  const user = await getCurrentUser()
  if (!user) {
    redirect(signInPath(name ? `/requests/new?name=${encodeURIComponent(name)}` : '/requests/new'))
  }

  return (
    <div>
      <h1 className="section-title">Request a tea</h1>
      <p className="subtle" style={{ maxWidth: 600 }}>
        Can&apos;t find a tea in LeafScore? Tell us about it and we&apos;ll add it once we&apos;ve checked it.
      </p>
      <div className="card" style={{ maxWidth: 600 }}>
        <TeaRequestForm initialName={name} />
      </div>
    </div>
  )
}
