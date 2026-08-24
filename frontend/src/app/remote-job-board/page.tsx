import { AppShell } from '@/components/AppShell'
import { RemoteJobBoardView } from '@/components/RemoteJobBoardView'

export default function RemoteJobBoardPage() {
  return (
    <AppShell active="remote-job-board">
      <RemoteJobBoardView />
    </AppShell>
  )
}
