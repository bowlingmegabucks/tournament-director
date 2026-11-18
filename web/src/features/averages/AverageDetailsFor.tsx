import { useCallback } from 'react'
import { Toast } from '../../shared/Toast'
import { AverageDetailsDialog } from './AverageDetailsDialog'
import { useAverages } from './useAverages'

interface AverageDetailsForProps {
  tournamentId: string
  registrationId: string
  onClose: () => void
}

/**
 * The details of one registration's average, for a page that does not hold the Averages list (the
 * Registrations page, AVG-11). It reads the list through the same query, so a verify on the
 * Averages page is already in the cache.
 */
export function AverageDetailsFor({
  tournamentId,
  registrationId,
  onClose,
}: Readonly<AverageDetailsForProps>) {
  const { data, error } = useAverages(tournamentId)
  const dismiss = useCallback(() => {
    onClose()
  }, [onClose])
  if (error) {
    return (
      <Toast kind="error" onDismiss={dismiss}>
        {error.message}
      </Toast>
    )
  }
  const row = data?.rows.find((candidate) => candidate.registrationId === registrationId)
  return row ? <AverageDetailsDialog row={row} onClose={onClose} /> : null
}
