import { AppShell } from '@/components/AppShell'
import { WatchlistView, type Company } from '@/components/WatchlistView'
import { serverGet } from '@/lib/server-api'

export default async function WatchlistPage() {
  const initialCompanies = await serverGet<Company[]>('/api/watchlist/companies')

  return (
    <AppShell active="watchlist">
      <WatchlistView initialCompanies={initialCompanies} />
    </AppShell>
  )
}
