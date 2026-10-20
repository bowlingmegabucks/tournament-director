import type { ReactNode } from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  kind: 'success' | 'error'
  children: ReactNode
  onDismiss: () => void
}

/** A filled snackbar in the top right corner, like MudBlazor's. Errors interrupt screen readers; success waits its turn. */
export function Toast({ kind, children, onDismiss }: ToastProps) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`${styles.toast} ${styles[kind]}`}>
      <span aria-hidden="true" className={styles.icon}>
        {kind === 'success' ? '✓' : '✕'}
      </span>
      <p className={styles.message}>{children}</p>
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
