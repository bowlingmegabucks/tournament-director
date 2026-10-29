import type { Division } from '../divisions/types.ts'
import type { BonusPins } from '../sweepers/types.ts'
import { handicap } from './handicap.ts'
import { buildPairs, comparePositions, pairOf, parsePosition } from './positions.ts'
import type { LaneBowler, LaneEntry, LanePage } from './types.ts'

/** What the page needs to know about the squad or sweeper. A sweeper also brings its bonus pins. */
export interface LaneSession {
  kind: 'squad' | 'sweeper'
  id: string
  date: string
  complete: boolean
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  bonusPins: BonusPins[]
}

// Ignores case and accents, as the database collation does (BWL-14).
function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

function compareNames(a: LaneEntry, b: LaneEntry): number {
  const byName = compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName)
  return byName || a.registrationId.localeCompare(b.registrationId)
}

export interface BuiltLanePage {
  page: LanePage
  /** Entries left out because their division is not one of the tournament's (D-51). */
  skipped: string[]
  /** Entries whose stored position names no pair of this session (D-61). */
  outsideLanes: string[]
}

/**
 * LAN-03, LAN-04, LAN-10, LAN-11, D-58, D-61: sort a session's entries into pairs, unassigned, and
 * other positions, with each bowler's handicap or bonus pins.
 *
 * A position that fits a pair of this session shows on it, whatever its letter or the pair's count
 * (a legacy 2B, or an over-full pair). A position that is not `<lane><letter>`, or names a lane
 * outside the session, goes to `other` with its raw text.
 */
export function buildLanePage(
  session: LaneSession,
  entries: readonly LaneEntry[],
  divisions: readonly Division[],
): BuiltLanePage {
  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const pairs = buildPairs(session.startingLane, session.numberOfLanes).map((pair) => ({
    ...pair,
    capacity: session.maxPerPair,
    bowlers: [] as LaneBowler[],
  }))
  const unassigned: LaneBowler[] = []
  const other: LaneBowler[] = []
  const skipped: string[] = []
  const outsideLanes: string[] = []
  const counts = new Map<string, number>()

  const bonusByDivision = new Map(
    session.bonusPins.map((pins) => [pins.divisionId, pins.bonusPinsPerGame]),
  )
  // The pair a position belongs to, with the parsed seat for sorting inside the pair.
  const placed: { bowler: LaneBowler; pairIndex: number; lane: number; letter: string }[] = []

  for (const entry of [...entries].sort(compareNames)) {
    const division = divisionById.get(entry.divisionId)
    if (!division) {
      skipped.push(entry.registrationId)
      continue
    }
    counts.set(division.id, (counts.get(division.id) ?? 0) + 1)

    const bowler: LaneBowler = {
      registrationId: entry.registrationId,
      name: entry.name,
      divisionId: division.id,
      divisionName: division.name,
      average: entry.average,
      position: entry.position,
      pins:
        session.kind === 'squad'
          ? handicap(entry.average, division)
          : (bonusByDivision.get(division.id) ?? 0),
      superSweeper: entry.superSweeper,
    }

    if (entry.position === '') {
      unassigned.push(bowler)
      continue
    }
    const parsed = parsePosition(entry.position)
    const pair = parsed ? pairOf(parsed.lane, pairs) : undefined
    if (!parsed || !pair) {
      other.push(bowler)
      outsideLanes.push(entry.registrationId)
      continue
    }
    placed.push({
      bowler,
      pairIndex: pairs.indexOf(pair),
      lane: parsed.lane,
      letter: parsed.letter,
    })
  }

  // LAN-04: lane, then letter, inside each pair.
  placed.sort((a, b) => comparePositions(a, b))
  for (const { bowler, pairIndex } of placed) pairs[pairIndex]?.bowlers.push(bowler)

  const page: LanePage = {
    session: {
      id: session.id,
      kind: session.kind,
      date: session.date,
      complete: session.complete,
      startingLane: session.startingLane,
      numberOfLanes: session.numberOfLanes,
      maxPerPair: session.maxPerPair,
    },
    pairs,
    unassigned,
    other: other.sort((a, b) => compareText(a.position, b.position)),
    divisions: [...divisions]
      .sort((a, b) => a.number - b.number || compareText(a.name, b.name))
      .map(({ id, number, name }) => ({ id, number, name, entries: counts.get(id) ?? 0 })),
  }
  return { page, skipped, outsideLanes }
}
