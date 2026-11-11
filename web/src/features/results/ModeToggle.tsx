import { useId } from 'react'
import { useSearchParams } from 'react-router'
import styles from './ResultsPage.module.css'
import type { RankMode } from './types'

/**
 * The "Ranking" choice of a results page (RES-45, D-239): through the last full game (the default)
 * or live. Two radio buttons drawn as one control. The choice stays in the address (`?mode=live`), so a
 * link carries it and nothing is stored; the default leaves the address clean. `steadyLabel` is
 * "Through game 3" once the page knows the game.
 */
export function ModeToggle({
  mode,
  steadyLabel,
}: Readonly<{ mode: RankMode; steadyLabel: string }>) {
  const name = useId()
  const [, setSearch] = useSearchParams()

  function choose(next: RankMode) {
    setSearch(
      (previous) => {
        const search = new URLSearchParams(previous)
        if (next === 'live') search.set('mode', 'live')
        else search.delete('mode')
        return search
      },
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: the history is the browser's; e2e checks the Back button.
      { replace: true },
    )
  }

  return (
    <fieldset className={styles.toggle}>
      <legend>Ranking</legend>
      <div className={styles.segments}>
        <label>
          <input
            type="radio"
            name={name}
            checked={mode === 'full-game'}
            onChange={() => {
              choose('full-game')
            }}
          />
          <span>{steadyLabel}</span>
        </label>
        <label>
          <input
            type="radio"
            name={name}
            checked={mode === 'live'}
            onChange={() => {
              choose('live')
            }}
          />
          <span>Live</span>
        </label>
      </div>
    </fieldset>
  )
}
