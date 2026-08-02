import { AppShell } from '@/components/AppShell'
import { RemoteJobBoardView, type Listing } from '@/components/RemoteJobBoardView'
import { serverGet } from '@/lib/server-api'

export default async function RemoteJobBoardPage() {
  const initialListings = await serverGet<Listing[]>('/api/remote-job-board/listings')

  return (
    <AppShell active="remote-job-board">
      <RemoteJobBoardView initialListings={initialListings} />
    </AppShell>
  )
}
