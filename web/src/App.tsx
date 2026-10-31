import { Route, Routes } from 'react-router'
import { DivisionsPage } from './features/divisions/DivisionsPage'
import { LanesPage } from './features/lanes/LanesPage'
import { SquadResultsPage } from './features/results/SquadResultsPage'
import { SweeperResultsPage } from './features/results/SweeperResultsPage'
import { ScoresPage } from './features/scores/ScoresPage'
import { OpenLanes, SquadPortal, SweeperPortal } from './features/lanes/SessionPortal'
import { RegistrationsPage } from './features/registrations/RegistrationsPage'
import { SquadsPage } from './features/squads/SquadsPage'
import { SweepersPage } from './features/sweepers/SweepersPage'
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
          <Route path="squads" element={<SquadsPage />} />
          <Route path="squads/:sessionId" element={<SquadPortal />}>
            <Route index element={<OpenLanes />} />
            <Route path="lanes" element={<LanesPage kind="squad" />} />
            <Route path="scores" element={<ScoresPage kind="squad" />} />
            <Route path="results" element={<SquadResultsPage />} />
          </Route>
          <Route path="sweepers" element={<SweepersPage />} />
          <Route path="sweepers/:sessionId" element={<SweeperPortal />}>
            <Route index element={<OpenLanes />} />
            <Route path="lanes" element={<LanesPage kind="sweeper" />} />
            <Route path="scores" element={<ScoresPage kind="sweeper" />} />
            <Route path="results" element={<SweeperResultsPage />} />
          </Route>
          <Route path="registrations" element={<RegistrationsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
