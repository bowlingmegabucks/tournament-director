import styles from './ResultsPage.module.css'

/**
 * The two print buttons of a results page with divisions (D-89): the division on screen, and every
 * division, one per page. Both open the browser print dialog.
 */
export function PrintButtons({
  onPrintThis,
  onPrintAll,
}: Readonly<{ onPrintThis: () => void; onPrintAll: () => void }>) {
  return (
    <div className={styles.buttons}>
      <button type="button" onClick={onPrintThis}>
        Print this division
      </button>
      <button type="button" onClick={onPrintAll}>
        Print all divisions
      </button>
    </div>
  )
}
