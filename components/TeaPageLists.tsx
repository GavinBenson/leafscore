import Link from 'next/link'
import { db } from '@/db/client'
import { SaveToList } from '@/components/SaveToList'
import { listsContainingTea } from '@/lib/data/lists'
import { canUseCellar, listLimitFor } from '@/lib/premium'

// Signed-in extras on the tea page: Save to list (PBI 44) and, for Premium,
// a link into the cellar (PBI 45). Per-user, so it is never cached.
export async function TeaPageLists({ teaId, userId, isPremium }: { teaId: number; userId: number; isPremium: boolean }) {
  const lists = await listsContainingTea(db, userId, teaId)
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <SaveToList
        teaId={teaId}
        isPremium={isPremium}
        limit={listLimitFor(isPremium)}
        lists={lists.map((l) => ({ id: l.id, title: l.title, contains: l.contains, isPublic: l.isPublic }))}
      />
      {canUseCellar(isPremium) && (
        <Link href={`/cellar?add=${teaId}`} className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>
          Add to cellar
        </Link>
      )}
    </div>
  )
}
