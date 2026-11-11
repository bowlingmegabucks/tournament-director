import { useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatPair } from '../lanes/format'
import { digitsOnly, gamesToFill, priorGames, readScore, sayGames } from './entryLogic'
import { entryPath } from './entryPaths'
import type { Game, GameBowler, GamePair } from './gamesTypes'
import styles from './PairSheet.module.css'
import type { SessionKind } from './types'
import { useSaveScore } from './useSaveScore'
import { useSetDnf } from './useSetDnf'

/** What a box says about its own save (SCR-15, D-228). */
type Mark =
  | { type: 'saving' }
  | { type: 'saved' }
  | { type: 'cleared' }
  | { type: 'invalid'; message: string }
  | { type: 'failed'; message: string }
  /** The "did not finish" change was refused. Not a failed score, so no Try again (SCR-24). */
  | { type: 'refused'; message: string }

interface PairSheetProps {
  kind: SessionKind
  tournamentId: string
  sessionId: string
  game: Game
  /** The pair of lanes asked for, or `undefined` when no bowler is on them in this game. */
  pair: GamePair | undefined
  /** The lanes in the address, for the message when the pair is empty. */
  firstLane: number
  previous: GamePair | undefined
  next: GamePair | undefined
  /** No saving: a complete session or tournament (D-10, D-231). */
  readOnly: boolean
}

/** The record without one key. */
function without<T>(record: Readonly<Record<string, T>>, id: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== id))
}

function markText(mark: Mark | undefined): string {
  switch (mark?.type) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return '✓ Saved'
    case 'cleared':
      return 'Cleared'
    case 'invalid':
    case 'failed':
    case 'refused':
      return mark.message
    case undefined:
      return ''
  }
}

/**
 * The scores of one game for the bowlers on one pair of lanes (SCR-21, D-230): a large number box
 * for each bowler, the lane they bowl this game, their other games as text, and a Next button.
 * Each box saves on its own when the keeper moves on (D-228); nothing else is touched. Saving a
 * game fills earlier empty games with 0, and the box says so before it happens (D-229). A box shows
 * what the keeper typed until its save succeeds, else the saved score, so a live update never
 * replaces typing. The phone's number pad has no Return key, so every box has a Next button.
 */
export function PairSheet({
  kind,
  tournamentId,
  sessionId,
  game,
  pair,
  firstLane,
  previous,
  next,
  readOnly,
}: Readonly<PairSheetProps>) {
  const save = useSaveScore(kind, tournamentId, sessionId)
  const flag = useSetDnf(kind, tournamentId, sessionId)
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  const [marks, setMarks] = useState<Readonly<Record<string, Mark>>>({})
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const nextPairLink = useRef<HTMLAnchorElement | null>(null)
  // A box saves on blur and on Next. Pressing Next blurs first, so the second ask joins the first.
  const inFlight = useRef(new Map<string, Promise<boolean>>())
  // The text each running save was made from, so a newer entry in the box is not mistaken for it.
  const inFlightText = useRef(new Map<string, string>())
  // What each box last saved (a score, or `null` for a clear). Moving focus leaves the box, and the
  // blur handler may still hold the render from before the save: this keeps it from saving twice.
  const lastSaved = useRef(new Map<string, number | null>())

  const board = entryPath(kind, tournamentId, sessionId, game.game)
  const lanes = pair ? formatPair(pair) : `Lanes ${firstLane}-${firstLane + 1}`
  const title = `Game ${game.game} · ${lanes}`

  function setMark(id: string, mark: Mark | undefined) {
    setMarks((current) => (mark ? { ...without(current, id), [id]: mark } : without(current, id)))
  }

  function dropDraft(id: string, onlyIf?: string) {
    setDrafts((current) =>
      onlyIf === undefined || current[id] === onlyIf ? without(current, id) : current,
    )
  }

  async function send(bowler: GameBowler, score: number | null, text: string): Promise<boolean> {
    const id = bowler.registrationId
    setMark(id, { type: 'saving' })
    try {
      await save.mutateAsync({ registrationId: id, game: game.game, score })
      lastSaved.current.set(id, score)
      // Keep a newer entry: the keeper may have changed the box while this save ran.
      dropDraft(id, text)
      setMark(id, { type: score === null ? 'cleared' : 'saved' })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save.'
      setMark(id, { type: 'failed', message })
      return false
    }
  }

  /** Flag a bowler "did not finish", or undo it (SCR-24, D-249). A refusal shows under the box. */
  async function changeDnf(bowler: GameBowler, flagged: boolean) {
    const id = bowler.registrationId
    setMark(id, { type: 'saving' })
    try {
      await flag.mutateAsync({ registrationId: id, flagged })
      setMark(id, undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save.'
      setMark(id, { type: 'refused', message })
    }
  }

  /** Save what the box holds, if it changed. True when there is nothing left to save. */
  function commit(bowler: GameBowler): Promise<boolean> {
    const id = bowler.registrationId
    const draft = drafts[id]
    const running = inFlight.current.get(id)
    if (running) {
      if (draft === undefined || draft === inFlightText.current.get(id)) return running
      // The box holds something newer than the save in flight: save that once this one is done.
      return running.then(() => commit(bowler))
    }
    if (draft === undefined) return Promise.resolve(true)
    if (draft === '' && (bowler.score === null || lastSaved.current.get(id) === null)) {
      dropDraft(id)
      return Promise.resolve(true)
    }
    let job: Promise<boolean>
    if (draft === '') {
      job = send(bowler, null, draft)
    } else {
      const read = readScore(draft)
      if ('problem' in read) {
        setMark(id, { type: 'invalid', message: read.problem })
        return Promise.resolve(false)
      }
      if (read.score === bowler.score || read.score === lastSaved.current.get(id)) {
        dropDraft(id)
        return Promise.resolve(true)
      }
      job = send(bowler, read.score, draft)
    }
    inFlight.current.set(id, job)
    inFlightText.current.set(id, draft)
    void job.finally(() => {
      inFlight.current.delete(id)
      inFlightText.current.delete(id)
    })
    return job
  }

  /**
   * A link that leaves the sheet saves every box first and goes only if all saved. The sheet would
   * unmount on the route change, taking a failure or a bad entry with it (D-228). Modified clicks
   * (new tab) and the like take the normal link path.
   */
  function leave(event: MouseEvent<HTMLAnchorElement>, to: string, bowlers: readonly GameBowler[]) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void Promise.all(bowlers.map((bowler) => commit(bowler))).then((results) => {
      if (results.every(Boolean)) void navigate(to)
    })
  }

  async function goNext(bowlers: readonly GameBowler[], index: number) {
    const bowler = bowlers[index]
    if (!bowler || !(await commit(bowler))) return
    const following = bowlers[index + 1]
    if (following) inputs.current.get(following.registrationId)?.focus()
    else nextPairLink.current?.focus()
  }

  if (!pair) {
    return (
      <section aria-label={title} className={styles.sheet}>
        <h2 className={styles.title}>{title}</h2>
        <p>
          No bowlers on {lanes.toLowerCase()} in game {game.game}.
        </p>
        <Link to={board}>Back to game {game.game}</Link>
      </section>
    )
  }

  const bowlers = pair.bowlers
  const allIn = bowlers.every((bowler) => bowler.score !== null)

  return (
    <section aria-label={title} className={styles.sheet}>
      <nav className={styles.nav} aria-label="Pairs">
        <Link
          className={styles.link}
          to={board}
          onClick={(event) => {
            leave(event, board, bowlers)
          }}
        >
          ← Game {game.game}
        </Link>
        {previous && (
          <Link
            className={styles.link}
            to={entryPath(kind, tournamentId, sessionId, game.game, previous.firstLane)}
            onClick={(event) => {
              leave(
                event,
                entryPath(kind, tournamentId, sessionId, game.game, previous.firstLane),
                bowlers,
              )
            }}
          >
            ← Pair {formatPair(previous).replace(/^Lanes? /, '')}
          </Link>
        )}
        {next && (
          <Link
            ref={nextPairLink}
            className={styles.link}
            to={entryPath(kind, tournamentId, sessionId, game.game, next.firstLane)}
            onClick={(event) => {
              leave(
                event,
                entryPath(kind, tournamentId, sessionId, game.game, next.firstLane),
                bowlers,
              )
            }}
          >
            Next pair {formatPair(next).replace(/^Lanes? /, '')} →
          </Link>
        )}
      </nav>
      <h2 className={styles.title}>{title}</h2>
      {allIn && (
        <p className={styles.done}>
          ✓ All {bowlers.length} scores are in for game {game.game} on these lanes.
        </p>
      )}
      <ul
        className={styles.rows}
        aria-label={`Scores for ${lanes.toLowerCase()}, game ${game.game}`}
      >
        {bowlers.map((bowler, index) => {
          const id = bowler.registrationId
          const mark = marks[id]
          const draft = drafts[id]
          const value = draft ?? (bowler.score === null ? '' : String(bowler.score))
          const fills = bowler.score === null ? gamesToFill(bowler, game.game) : []
          const prior = priorGames(bowler, game.game)
          const problemId = `${id}-problem`
          const invalid = mark?.type === 'invalid' || mark?.type === 'failed'
          const problem = invalid || mark?.type === 'refused'
          const hasScore = bowler.scores.some((score) => score !== null)
          const last = index === bowlers.length - 1
          return (
            <li key={id} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.lane}>{bowler.lane}</span>
                <span className={styles.name}>{bowler.name}</span>
                <span className={styles.division}>{bowler.divisionName}</span>
              </div>
              <p className={styles.total}>
                <span className={styles.label}>Total</span> {bowler.total}
              </p>
              <div className={styles.entry}>
                <input
                  ref={(node) => {
                    if (node) inputs.current.set(id, node)
                    else inputs.current.delete(id)
                  }}
                  className={styles.box}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint={last ? 'done' : 'next'}
                  autoComplete="off"
                  readOnly={readOnly}
                  aria-label={`Lane ${bowler.lane}, ${bowler.name}, game ${game.game}`}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={invalid ? problemId : undefined}
                  value={value}
                  onChange={(event) => {
                    const text = digitsOnly(event.target.value)
                    // A new entry is compared with the page again, not with the last save.
                    lastSaved.current.delete(id)
                    setDrafts((current) => ({ ...current, [id]: text }))
                    if (mark?.type === 'invalid' || mark?.type === 'failed') setMark(id, undefined)
                  }}
                  onBlur={() => {
                    void commit(bowler)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void goNext(bowlers, index)
                  }}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className={styles.next}
                    onClick={() => {
                      void goNext(bowlers, index)
                    }}
                  >
                    {last ? 'Done' : 'Next'}
                    <span className={styles.hidden}>, {bowler.name}</span>
                  </button>
                )}
              </div>
              <p className={styles.prior}>{prior}</p>
              <p
                id={problemId}
                className={problem ? styles.problem : styles.mark}
                aria-live="polite"
              >
                {markText(mark)}
              </p>
              {fills.length > 0 && !readOnly && (
                <p className={styles.hint}>
                  No scores for {sayGames(fills)}. Saving game {game.game} saves them as 0 (missed).
                </p>
              )}
              {!readOnly && (bowler.dnf || hasScore) && (
                <div className={styles.dnf}>
                  {bowler.dnf ? (
                    <>
                      <output className={styles.dnfState}>Did not finish</output>
                      <button
                        type="button"
                        className={styles.dnfButton}
                        onClick={() => {
                          void changeDnf(bowler, false)
                        }}
                      >
                        <span>Undo</span>
                        <span className={styles.hidden}>, did not finish for {bowler.name}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.dnfButton}
                      onClick={() => {
                        void changeDnf(bowler, true)
                      }}
                    >
                      Did not finish<span className={styles.hidden}>, {bowler.name}</span>
                    </button>
                  )}
                </div>
              )}
              {mark?.type === 'failed' && !readOnly && (
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() => {
                    void commit(bowler)
                  }}
                >
                  Try again
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
