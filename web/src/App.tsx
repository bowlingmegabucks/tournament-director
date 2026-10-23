import { Route, Routes } from 'react-router'
import { DivisionsPage } from './features/divisions/DivisionsPage'
import { HomePage } from './features/home/HomePage'
import { TournamentLayout } from './features/tournaments/TournamentLayout'
import { TournamentOverview } from './features/tournaments/TournamentOverview'
import { TournamentsPage } from './features/tournaments/TournamentsPage'
import { AppShell } from './shared/AppShell'
import { NotFoundPage } from './shared/NotFoundPage'

/** The routes. `main.tsx` supplies the router, and tests supply a memory router. */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="tournaments" element={<TournamentsPage />} />
        <Route path="tournaments/:id" element={<TournamentLayout />}>
          <Route index element={<TournamentOverview />} />
          <Route path="divisions" element={<DivisionsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
