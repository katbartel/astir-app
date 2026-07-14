import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { JobBoardsView } from '@/components/JobBoardsView'
import { getCurrentUser } from '@/lib/auth'

export default async function JobBoardsPage() {
  // Admin-only feature: non-admins are sent back to Home.
  const user = await getCurrentUser()
  if (!user?.isAdmin) {
    redirect('/')
  }

  return (
    <AppShell active="job-boards">
      <JobBoardsView />
    </AppShell>
  )
}
