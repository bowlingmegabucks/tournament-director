import { Link } from 'react-router'
import { signInEnabled } from './signInEnabled'
import { useMe, useSignOut } from './useMe'
import styles from './AuthMenu.module.css'

/** The right end of the top bar: "Sign in", or the user's name with "Sign out". Hidden when sign-in is off. */
export function AuthMenu() {
  if (!signInEnabled()) return null
  return <AuthMenuContent />
}

function AuthMenuContent() {
  const { data, isPending, error, refetch } = useMe()
  const signOut = useSignOut()

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
      <Link to="/login" className={styles.link}>
        Sign in
      </Link>
    )
  return (
    <div className={styles.who}>
      <span>{data.user.name}</span>
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
