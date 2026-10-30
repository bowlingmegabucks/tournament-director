import { createPortal } from 'react-dom'
import { RecapSheet } from './RecapSheet'
import styles from './PrintSheets.module.css'
import type { RecapSession, RecapSheet as Sheet, SkipPattern } from './types'

interface PrintSheetsProps {
  sheets: readonly Sheet[]
  session: Pick<RecapSession, 'date' | 'games'>
  pattern: SkipPattern
}

/** The sheets to print, one per page, in a portal on `document.body` (D-62). Hidden on screen. */
export function PrintSheets({ sheets, session, pattern }: Readonly<PrintSheetsProps>) {
  return createPortal(
    <div className={styles.root}>
      {sheets.map((sheet) => (
        <RecapSheet key={sheet.registrationId} sheet={sheet} session={session} pattern={pattern} />
      ))}
    </div>,
    document.body,
  )
}
