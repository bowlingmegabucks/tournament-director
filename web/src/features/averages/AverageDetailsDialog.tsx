import { useId, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import own from './Averages.module.css'
import type { AverageRow } from './types'

interface AverageDetailsDialogProps {
  row: AverageRow
  onClose: () => void
}

/** "11/17/2026, 4:12 PM". The time is the viewer's own. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * What a director did to one average (AVG-11, D-295): the average the bowler gave, the one
 * handicap uses, why, and who and when. Opened from the Averages page and the Registrations page.
 */
export function AverageDetailsDialog({ row, onClose }: Readonly<AverageDetailsDialogProps>) {
  const titleId = useId()
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })
  return (
    <dialog ref={open} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          Average: {row.bowlerName}
        </h2>
        <dl className={own.details}>
          <dt>Provided</dt>
          <dd>{row.providedAverage ?? 'None'}</dd>
          <dt>{row.status === 'adjusted' ? 'Verified' : 'Used'}</dt>
          <dd>{row.averageInUse ?? 'None'}</dd>
          {row.note !== null && (
            <>
              <dt>Why</dt>
              <dd>{row.note}</dd>
            </>
          )}
          {row.verifiedBy !== null && row.verifiedAt !== null && (
            <>
              <dt>By</dt>
              <dd>
                {row.verifiedBy}, {formatWhen(row.verifiedAt)}
              </dd>
            </>
          )}
        </dl>
        <div className={styles.actions}>
          <button type="button" onClick={closeDialogOf}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}
