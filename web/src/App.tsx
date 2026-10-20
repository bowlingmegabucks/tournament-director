import logo from './assets/logo.png'
import styles from './App.module.css'
import { HealthCheckButton } from './features/health/HealthCheckButton'
import { TournamentList } from './features/tournaments/TournamentList'

export default function App() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <img className={styles.logo} src={logo} alt="Northeast MegaBuck$ Tournament" />
        </div>
      </header>
      <main className={styles.main}>
        <h1>Tournament Management</h1>
        <HealthCheckButton />
        <TournamentList />
      </main>
    </>
  )
}
