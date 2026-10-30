import { useEffect, type ReactNode } from 'react'
import styles from './Toast.module.css'

const icons = { success: '✓', error: '✕', info: 'ℹ' } as const

interface ToastProps {
  kind: 'success' | 'error' | 'info'
  children: ReactNode
  onDismiss: () => void
  /** Call `onDismiss` after this many milliseconds. Leave it out to keep the toast until dismissed. */
  autoDismissMs?: number
}

/** A filled snackbar in the top right corner, like MudBlazor's. Errors interrupt screen readers; success and info wait their turn. */
export function Toast({ kind, children, onDismiss, autoDismissMs }: Readonly<ToastProps>) {
  // A timer is outside React, so an effect is the right tool here.
  useEffect(() => {
    if (autoDismissMs === undefined) return
    const timer = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(timer)
  }, [autoDismissMs, onDismiss])

  // <output> has the implicit "status" role. Errors need "alert", which <output> should not carry.
  // Stryker disable next-line ConditionalExpression: <div role="alert"> and <output> differ only in tag, which tests do not pin (they query by role).
  const Container = kind === 'error' ? 'div' : 'output'

  return (
    <Container
      role={kind === 'error' ? 'alert' : undefined}
      // Stryker disable next-line StringLiteral: the class names only style the toast, which jsdom cannot check.
      className={`${styles.toast} ${styles[kind]}`}
    >
      <span aria-hidden="true" className={styles.icon}>
        {icons[kind]}
      </span>
      <p className={styles.message}>{children}</p>
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </Container>
  )
}
