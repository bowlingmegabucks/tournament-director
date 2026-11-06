import { Route, Routes } from 'react-router'
import { AccountPage } from './features/account/AccountPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { SetPasswordPage } from './features/auth/SetPasswordPage'
import { RequirePermission } from './features/auth/RequirePermission'
import { signInEnabled } from './features/auth/signInEnabled'
import { DivisionsPage } from './features/divisions/DivisionsPage'
import { NewDivisionPage } from './features/divisions/NewDivisionPage'
import { LanesPage } from './features/lanes/LanesPage'
import { AtLargePage } from './features/results/AtLargePage'
import { SeedingPage } from './features/results/SeedingPage'
import { SuperSweeperPage } from './features/results/SuperSweeperPage'
import { SquadResultsPage } from './features/results/SquadResultsPage'
import { SweeperResultsPage } from './features/results/SweeperResultsPage'
import { ScoresPage } from './features/scores/ScoresPage'
import { OpenLanes, SquadPortal, SweeperPortal } from './features/lanes/SessionPortal'
import { RegistrationsPage } from './features/registrations/RegistrationsPage'
import { SquadsPage } from './features/squads/SquadsPage'
import { SweepersPage } from './features/sweepers/SweepersPage'
import { HomePage } from './features/home/HomePage'
import { UsersPage } from './features/users/UsersPage'
import { NewUserPage } from './features/users/NewUserPage'
import { EditTournamentPage } from './features/tournaments/EditTournamentPage'
import { NewTournamentPage } from './features/tournaments/NewTournamentPage'
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
        <Route
          path="tournaments/new"
          element={
            <RequirePermission permission="tournaments.write">
              <NewTournamentPage />
            </RequirePermission>
          }
        />
        <Route path="tournaments/:id" element={<TournamentLayout />}>
          <Route index element={<TournamentOverview />} />
          <Route
            path="edit"
            element={
              <RequirePermission permission="tournaments.write">
                <EditTournamentPage />
              </RequirePermission>
            }
          />
          <Route path="divisions" element={<DivisionsPage />} />
          <Route
            path="divisions/new"
            element={
              <RequirePermission permission="divisions.write">
                <NewDivisionPage />
              </RequirePermission>
            }
          />
          <Route path="squads" element={<SquadsPage />} />
          <Route path="squads/:sessionId" element={<SquadPortal />}>
            <Route index element={<OpenLanes />} />
            <Route
              path="lanes"
              element={
                <RequirePermission permission="lanes.read">
                  <LanesPage kind="squad" />
                </RequirePermission>
              }
            />
            <Route path="scores" element={<ScoresPage kind="squad" />} />
            <Route path="results" element={<SquadResultsPage />} />
          </Route>
          <Route path="sweepers" element={<SweepersPage />} />
          <Route path="sweepers/:sessionId" element={<SweeperPortal />}>
            <Route index element={<OpenLanes />} />
            <Route
              path="lanes"
              element={
                <RequirePermission permission="lanes.read">
                  <LanesPage kind="sweeper" />
                </RequirePermission>
              }
            />
            <Route path="scores" element={<ScoresPage kind="sweeper" />} />
            <Route path="results" element={<SweeperResultsPage />} />
          </Route>
          <Route path="super-sweeper" element={<SuperSweeperPage />} />
          <Route
            path="registrations"
            element={
              <RequirePermission permission="registrations.read">
                <RegistrationsPage />
              </RequirePermission>
            }
          />
          <Route path="at-large" element={<AtLargePage />} />
          <Route path="seeding" element={<SeedingPage />} />
        </Route>
        <Route
          path="account"
          element={
            <RequirePermission>
              <AccountPage />
            </RequirePermission>
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permission="users.manage">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="users/new"
          element={
            <RequirePermission permission="users.manage">
              <NewUserPage />
            </RequirePermission>
          }
        />
        {signInEnabled() && <Route path="login" element={<LoginPage />} />}
        {signInEnabled() && <Route path="forgot-password" element={<ForgotPasswordPage />} />}
        {signInEnabled() && <Route path="set-password" element={<SetPasswordPage />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
