import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { JobBoardsView, type Listing } from '@/components/JobBoardsView'
import { getCurrentUser } from '@/lib/auth'
import { serverGet } from '@/lib/server-api'

export default async function JobBoardsPage() {
  // Admin-only feature: non-admins are sent back to Home. The listings are
  // fetched only after that check passes, so a non-admin never triggers it.
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    redirect('/')
  }

  const initialListings = await serverGet<Listing[]>('/api/job-boards/listings')

  return (
    <AppShell active="job-boards">
      <JobBoardsView initialListings={initialListings} />
    </AppShell>
  )
}
