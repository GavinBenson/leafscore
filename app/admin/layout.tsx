import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'

// Admin pages are per-user and must never be prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user || !user.isAdmin) {
    redirect('/')
  }

  return <>{children}</>
}
