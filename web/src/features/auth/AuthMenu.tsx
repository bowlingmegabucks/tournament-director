import { Link, useLocation } from 'react-router'
import { signInEnabled } from './signInEnabled'
import { useMe, useSignOut } from './useMe'
import styles from './AuthMenu.module.css'

/** The right end of the top bar: "Sign in", or the user's name with "Sign out". Hidden when sign-in is off. */
export function AuthMenu() {
  if (!signInEnabled()) return null
  return <AuthMenuContent />
}

const signInPages = new Set(['/login', '/forgot-password', '/set-password'])
const onSignInPage = (pathname: string) => signInPages.has(pathname)

function AuthMenuContent() {
  const { data, isPending, error, refetch } = useMe()
  const signOut = useSignOut()
  const location = useLocation()

  // Plain text, not `Loading`: the page below has its own status, and tests and readers find that one.
  if (isPending) return <span className={styles.muted}>Loading…</span>
  if (error) {
    return (
      <div className={styles.who}>
        <span role="alert" className={styles.muted}>
          {error.message}
        </span>
        <button
          type="button"
          onClick={() => {
            void refetch()
          }}
        >
          Try again
        </button>
      </div>
    )
  }
  if (data.user === null)
    return (
      <Link
        to="/login"
        // Sign-in returns to the page the user is on (the login page reads `from`). The sign-in
        // pages themselves are no place to return to.
        state={onSignInPage(location.pathname) ? undefined : { from: location }}
        className={styles.link}
      >
        Sign in
      </Link>
    )
  return (
    <div className={styles.who}>
      <Link to="/account" className={styles.name}>
        {data.user.name}
      </Link>
      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate()
        }}
      >
        Sign out
      </button>
      {signOut.error && (
        <span role="alert" className={styles.error}>
          {signOut.error.message}
        </span>
      )}
    </div>
  )
}
