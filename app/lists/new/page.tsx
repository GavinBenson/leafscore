import { redirect } from 'next/navigation'
import { ListEditor } from '@/components/ListEditor'
import { signInPath } from '@/lib/authRedirect'
import { getCurrentUser } from '@/lib/session'

export const metadata = { title: 'New list', robots: { index: false } }

export default async function NewListPage() {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/lists/new'))
  return (
    <div>
      <h1 className="section-title">New list</h1>
      <ListEditor />
    </div>
  )
}
