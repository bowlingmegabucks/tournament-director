import { useEffect } from 'react'
import { Toast } from '../../shared/Toast'
import { useHealthCheck } from './useHealthCheck'

interface HealthCheckButtonProps {
  /** How long the success toast stays. Errors stay until dismissed. */
  successToastMs?: number
}

export function HealthCheckButton({ successToastMs = 5000 }: HealthCheckButtonProps) {
  const { mutate, reset, isPending, isSuccess, isError, error } = useHealthCheck()

  // A timer is outside React, so an effect is the right tool here.
  useEffect(() => {
    if (!isSuccess) return
    const timer = setTimeout(reset, successToastMs)
    return () => clearTimeout(timer)
  }, [isSuccess, reset, successToastMs])

  return (
    <>
      <button type="button" disabled={isPending} onClick={() => mutate()}>
        {isPending ? 'Checking…' : 'Check API'}
      </button>
      {isSuccess && (
        <Toast kind="success" onDismiss={reset}>
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
