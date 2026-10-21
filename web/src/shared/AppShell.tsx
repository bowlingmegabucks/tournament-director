import { NavLink, Outlet } from 'react-router'
import logo from '../assets/logo.png'
import styles from './AppShell.module.css'

/** The logo header and the main menu, on every page (NAV-01). */
export function AppShell() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <img className={styles.logo} src={logo} alt="Northeast MegaBuck$ Tournament" />
        </div>
      </header>
      <nav aria-label="Main" className={styles.nav}>
        <ul className={styles.menu}>
          <li>
            <NavLink to="/" end>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/tournaments">Tournaments</NavLink>
          </li>
        </ul>
      </nav>
      <Outlet />
    </>
  )
}
