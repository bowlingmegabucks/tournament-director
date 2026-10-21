import styles from './QueryError.module.css'

interface QueryErrorProps {
  error: Error
  onRetry: () => void
}

export function QueryError({ error, onRetry }: Readonly<QueryErrorProps>) {
  return (
    <div role="alert" className={styles.error}>
      <p>{error.message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
