import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'

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
