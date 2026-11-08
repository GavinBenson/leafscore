import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { ListEditor } from '@/components/ListEditor'
import { DeleteListButton, ListTeaManager } from '@/components/ListTeaManager'
import { signInPath } from '@/lib/authRedirect'
import { getListWithTeas } from '@/lib/data/lists'
import { parseId } from '@/lib/ids'
import { getCurrentUser } from '@/lib/session'

export const metadata = { title: 'Edit list', robots: { index: false } }

export default async function EditListPage({ params }: { params: Promise<{ id: string }> }) {
  const listId = parseId((await params).id)
  if (listId === null) notFound()

  const user = await getCurrentUser()
  if (!user) redirect(signInPath(`/lists/${listId}/edit`))

  const data = await getListWithTeas(db, listId, user.id)
  // Someone else's list looks exactly like one that does not exist.
  if (!data || !data.isOwner) notFound()
  const { list, teas } = data

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link href={`/lists/${list.id}`}>Back to list</Link>
      </p>
      <h1 className="section-title">Edit list</h1>
      {list.hidden && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          <strong>Hidden by moderators.</strong> This list is not visible to anyone else.
        </div>
      )}
      <ListEditor list={{ id: list.id, title: list.title, description: list.description ?? '', isPublic: list.isPublic }} />
      <ListTeaManager
        listId={list.id}
        teas={teas.map(({ tea, brand }) => ({ id: tea.id, name: tea.name, brandName: brand?.name ?? null }))}
      />
      <div style={{ marginTop: 32 }}>
        <DeleteListButton listId={list.id} title={list.title} />
      </div>
    </div>
  )
}
