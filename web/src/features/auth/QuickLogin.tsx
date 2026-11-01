import { localUsers } from './localUsers'
import styles from './LoginPage.module.css'

interface QuickLoginProps {
  disabled: boolean
  onPick: (email: string, password: string) => void
}

/** Dev-only buttons that sign in as a seeded user (D-104). `LoginPage` renders it only when `import.meta.env.DEV`. */
export function QuickLogin({ disabled, onPick }: Readonly<QuickLoginProps>) {
  return (
    <div className={styles.dev}>
      <p className={styles.devNote}>Development only. Needs npm run db:seed.</p>
      {localUsers.map((user) => (
        <button
          key={user.email}
          type="button"
          className={styles.secondary}
          disabled={disabled}
          onClick={() => {
            onPick(user.email, user.password)
          }}
        >
          {user.label}
        </button>
      ))}
    </div>
  )
}
