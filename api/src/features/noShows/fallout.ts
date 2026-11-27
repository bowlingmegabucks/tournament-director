import type { Division } from '../divisions/types.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { workOutAtLarge, workOutSeeding, type SquadRun } from '../results/finals.ts'
import { compareText } from '../results/resultHelpers.ts'
import { workOutSquads, type WorkedSquad } from '../results/squadFlow.ts'
import type { ScoreRow } from '../scores/types.ts'
import type { Squad } from '../squads/types.ts'
import type { AtLargeChange, EntryKey, KeepChoice, SquadChange } from './types.ts'

/**
 * What removing one squad entry does to the results (NSH-09). The results are worked out as they
 * are and as they would be, and compared. Nothing here reads storage.
 */
export interface Snapshot {
  /** Every squad of the tournament, in date order (SQD-20). */
  squads: readonly Squad[]
  divisions: readonly Division[]
  entries: ReadonlyMap<string, readonly LaneEntry[]>
  scores: ReadonlyMap<string, readonly ScoreRow[]>
  /** The tournament's finals ratio, for at-large (RES-12). */
  finalsRatio: number
}

/** The squad entry that goes away. The target squad is left out: it has not been bowled. */
export type Removal = EntryKey

const keyOf = ({ squadId, registrationId }: EntryKey) => `${squadId}:${registrationId}`

/** The entries as they would be: one removed, and the kept bowlers flagged (NSH-20). */
function afterEntries(
  snapshot: Snapshot,
  removal: Removal,
  kept: ReadonlySet<string>,
): Map<string, LaneEntry[]> {
  return new Map(
    snapshot.squads.map((squad) => [
      squad.id,
      (snapshot.entries.get(squad.id) ?? [])
        .filter(
          (entry) =>
            squad.id !== removal.squadId || entry.registrationId !== removal.registrationId,
        )
        .map((entry) =>
          kept.has(keyOf({ squadId: squad.id, registrationId: entry.registrationId }))
            ? { ...entry, forcedAdvancer: true }
            : entry,
        ),
    ]),
  )
}

function work(snapshot: Snapshot, entries: ReadonlyMap<string, readonly LaneEntry[]>) {
  return workOutSquads(
    {
      lanes: { listEntries: (id) => Promise.resolve([...(entries.get(id) ?? [])]) },
      scores: { listScores: (id) => Promise.resolve([...(snapshot.scores.get(id) ?? [])]) },
    },
    snapshot.squads,
    snapshot.divisions,
  )
}

interface Placed {
  squadId: string
  squadDate: string
  complete: boolean
  divisionName: string
  registrationId: string
  name: string
}

/** Every advancer and casher of every squad, by entry. */
function placings(worked: readonly WorkedSquad[], divisions: readonly Division[]) {
  const nameOf = new Map(divisions.map((division) => [division.id, division.name]))
  const advancers = new Map<string, Placed>()
  const cashers = new Map<string, Placed>()
  for (const { squad, outcomes } of worked) {
    for (const { divisionId, outcome } of outcomes) {
      const placed = (entry: { registrationId: string; name: string }): Placed => ({
        squadId: squad.id,
        squadDate: squad.date,
        complete: squad.complete,
        divisionName: nameOf.get(divisionId) ?? '',
        registrationId: entry.registrationId,
        name: entry.name,
      })
      for (const entry of outcome.advancers) {
        advancers.set(
          keyOf({ squadId: squad.id, registrationId: entry.registrationId }),
          placed(entry),
        )
      }
      for (const entry of outcome.cashers) {
        cashers.set(
          keyOf({ squadId: squad.id, registrationId: entry.registrationId }),
          placed(entry),
        )
      }
    }
  }
  return { advancers, cashers }
}

const missingFrom = (from: ReadonlyMap<string, Placed>, other: ReadonlyMap<string, Placed>) =>
  [...from].filter(([key]) => !other.has(key)).map(([, placed]) => placed)

function toBowler({ squadId, squadDate, divisionName, registrationId, name }: Placed) {
  return { squadId, squadDate, divisionName, registrationId, name }
}

const byDateThenName = <T extends { squadDate: string; divisionName: string; name: string }>(
  a: T,
  b: T,
) =>
  a.squadDate.localeCompare(b.squadDate) ||
  compareText(a.divisionName, b.divisionName) ||
  compareText(a.name, b.name)

function runsOf(worked: readonly WorkedSquad[], divisionId: string): SquadRun[] {
  return worked.flatMap(({ squad, outcomes }) =>
    outcomes
      .filter((each) => each.divisionId === divisionId)
      .map(({ outcome }) => ({ squadId: squad.id, squadDate: squad.date, outcome })),
  )
}

/** The at-large field and the finalists of one division. */
function finalsOf(worked: readonly WorkedSquad[], divisionId: string, finalsRatio: number) {
  const runs = runsOf(worked, divisionId)
  const atLarge = workOutAtLarge(runs, finalsRatio)
  return { atLarge, seeding: workOutSeeding(runs, atLarge) }
}

export interface Fallout {
  changes: SquadChange[]
  keepAdvancing: KeepChoice[]
  /** The ticked boxes that do something. A tick on a bowler who would not drop is ignored. */
  kept: EntryKey[]
  atLarge: AtLargeChange[]
  /** Squad entries that were cashers and would not be, as `squadId:registrationId`. */
  lostCash: ReadonlySet<string>
  /** Finalists who would not be, as `divisionId:registrationId`. */
  lostFinals: ReadonlySet<string>
  /** Squads whose advancers or cashers change. */
  changedSquadIds: string[]
}

export async function workOutFallout(
  snapshot: Snapshot,
  removal: Removal,
  requested: readonly EntryKey[],
): Promise<Fallout> {
  const { divisions, finalsRatio } = snapshot
  const beforeWorked = await work(snapshot, snapshot.entries)
  const before = placings(beforeWorked, divisions)
  const run = async (kept: ReadonlySet<string>) => {
    const worked = await work(snapshot, afterEntries(snapshot, removal, kept))
    return { worked, ...placings(worked, divisions) }
  }

  // NSH-20: only a bowler who advanced from a completed squad can be kept, and only while the
  // removal would drop them with the other ticks in place.
  let kept = new Set(
    requested.map(keyOf).filter((key) => before.advancers.get(key)?.complete === true),
  )
  for (const key of [...kept]) {
    const without = new Set([...kept].filter((other) => other !== key))
    if ((await run(without)).advancers.has(key)) kept = without // NOSONAR: each tick depends on the last
  }

  const after = await run(kept)
  const unticked = await run(new Set())
  const offered = new Map(
    [
      ...missingFrom(before.advancers, after.advancers),
      ...missingFrom(before.advancers, unticked.advancers),
    ]
      .filter((placed) => placed.complete)
      .map((placed) => [keyOf(placed), placed]),
  )
  for (const key of kept) {
    const placed = before.advancers.get(key)
    if (placed) offered.set(key, placed)
  }

  const removedKey = keyOf(removal)
  const changeList = (list: Placed[], change: SquadChange['change']): SquadChange[] =>
    list
      .filter((placed) => keyOf(placed) !== removedKey)
      .map((placed) => ({ ...toBowler(placed), change }))
  const changes = [
    ...changeList(missingFrom(before.advancers, after.advancers), 'losesAdvance'),
    ...changeList(missingFrom(after.advancers, before.advancers), 'gainsAdvance'),
    ...changeList(missingFrom(before.cashers, after.cashers), 'losesCash'),
    ...changeList(missingFrom(after.cashers, before.cashers), 'gainsCash'),
  ].toSorted(byDateThenName)

  const atLarge: AtLargeChange[] = []
  const lostFinals = new Set<string>()
  for (const division of divisions.toSorted((a, b) => compareText(a.name, b.name))) {
    const was = finalsOf(beforeWorked, division.id, finalsRatio)
    const now = finalsOf(after.worked, division.id, finalsRatio)
    const finalistsNow = new Set(now.seeding.finalists.map((item) => item.entry.registrationId))
    for (const { entry } of was.seeding.finalists) {
      if (!finalistsNow.has(entry.registrationId)) {
        lostFinals.add(`${division.id}:${entry.registrationId}`)
      }
    }
    const idsOf = (outcome: typeof was.atLarge) =>
      new Set(outcome.advancers.map((item) => item.entry.bowlerId))
    const wasIds = idsOf(was.atLarge)
    const nowIds = idsOf(now.atLarge)
    const namesNotIn = (outcome: typeof was.atLarge, other: ReadonlySet<string>) =>
      outcome.advancers
        .filter((item) => !other.has(item.entry.bowlerId))
        .map((item) => item.entry.name)
    const joins = namesNotIn(now.atLarge, wasIds)
    const leaves = namesNotIn(was.atLarge, nowIds)
    if (was.atLarge.atLargeSpots !== now.atLarge.atLargeSpots || joins.length + leaves.length > 0) {
      atLarge.push({
        divisionId: division.id,
        divisionName: division.name,
        spotsBefore: was.atLarge.atLargeSpots,
        spotsAfter: now.atLarge.atLargeSpots,
        joins,
        leaves,
      })
    }
  }

  return {
    changes,
    keepAdvancing: [...offered]
      .map(([key, placed]) => ({ ...toBowler(placed), kept: kept.has(key) }))
      .toSorted(byDateThenName),
    kept: [...kept].flatMap((key) => {
      const placed = before.advancers.get(key)
      return placed ? [{ squadId: placed.squadId, registrationId: placed.registrationId }] : []
    }),
    atLarge,
    lostCash: new Set(missingFrom(before.cashers, after.cashers).map(keyOf)),
    lostFinals,
    changedSquadIds: [...new Set(changes.map((change) => change.squadId))],
  }
}
