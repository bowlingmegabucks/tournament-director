import { Toast } from '../../shared/Toast'
import { useHealthCheck } from './useHealthCheck'

interface HealthCheckButtonProps {
  /** How long the success toast stays. Errors stay until dismissed. */
  successToastMs?: number
}

export function HealthCheckButton({ successToastMs = 5000 }: Readonly<HealthCheckButtonProps>) {
  const { mutate, reset, isPending, isSuccess, isError, error } = useHealthCheck()

  return (
    <>
      <button type="button" disabled={isPending} onClick={() => mutate()}>
        {isPending ? 'Checking…' : 'Check API'}
      </button>
      {isSuccess && (
        <Toast kind="success" onDismiss={reset} autoDismissMs={successToastMs}>
          API is healthy
        </Toast>
      )}
      {isError && (
        <Toast kind="error" onDismiss={reset}>
          {error.message}
        </Toast>
      )}
    </>
  )
}
