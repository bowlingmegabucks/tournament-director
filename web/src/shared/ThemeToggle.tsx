import styles from './ThemeToggle.module.css'
import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      className={styles.toggle}
      onClick={toggleTheme}
    >
      <span>Dark mode</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  )
}
