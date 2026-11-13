import { HttpError } from '../../shared/errors.ts'
import { loadSeeding, loadSuperSweeper } from '../results/loadFinals.ts'
import { loadSquadResults, loadSweeperResults, type ResultsDeps } from '../results/loadResults.ts'
import type { Reporting } from '../results/resultHelpers.ts'
import { finalsPayees, squadPayees, superSweeperPayees, sweeperPayees } from './payeesOf.ts'
import { formatCents } from './money.ts'
import { gateReason, lockedMessage } from './savePlan.ts'
import type { PayoutStore } from './store.ts'
import type {
  Payee,
  PayoutRecord,
  PayoutSheet,
  PayoutSource,
  PayoutView,
  SheetOther,
  SheetPayee,
} from './types.ts'

/** What the entry sheet and a save read: the results code, and the whole payout store. */
export type SheetDeps = Omit<ResultsDeps, 'payouts'> & { payouts: PayoutStore }

/** A bowler entered in the event (D-269). */
export interface Entered {
  name: string
  divisionName: string
}

/** The event as the results describe it: who is inferred, and who is entered (D-268, D-269). */
export interface WorkedEvent {
  label: string
  date: string | null
  divisionName: string | null
  payees: Payee[]
  entered: Map<string, Entered>
}

/**
 * Work out one event from the results: the inferred payees and everyone entered. Rank mode is
 * `full-game`: a complete session counts every game, so the lists cannot move once the gate opens.
 * An unknown session or division is a 404 from the loaders (the caller checked the facts first).
 */
export async function workOutEvent(
  deps: SheetDeps,
  reporting: Reporting,
  source: PayoutSource,
  tournamentId: string,
  eventId: string,
): Promise<WorkedEvent> {
  const mode = { mode: 'full-game' as const }
  // The results loaders only read the amounts, which the store's narrow port gives them.
  const resultsDeps: ResultsDeps = deps
  switch (source) {
    case 'squad': {
      const [results, entries, divisions] = await Promise.all([
        loadSquadResults(resultsDeps, reporting, tournamentId, eventId, mode),
        deps.lanes.listEntries(eventId),
        deps.divisions.listByTournament(tournamentId),
      ])
      return {
        label: 'Squad',
        date: results.session.date,
        divisionName: null,
        payees: squadPayees(results),
        entered: enteredBy(entries, divisions),
      }
    }
    case 'sweeper': {
      const [results, entries, divisions] = await Promise.all([
        loadSweeperResults(resultsDeps, reporting, tournamentId, eventId, mode),
        deps.lanes.listEntries(eventId),
        deps.divisions.listByTournament(tournamentId),
      ])
      return {
        label: 'Sweeper',
        date: results.session.date,
        divisionName: null,
        payees: sweeperPayees(results),
        entered: enteredBy(entries, divisions),
      }
    }
    case 'superSweeper': {
      const results = await loadSuperSweeper(resultsDeps, reporting, tournamentId, mode)
      return {
        label: 'Super sweeper',
        date: null,
        divisionName: null,
        payees: superSweeperPayees(results),
        entered: new Map(results.rows.map((row) => [row.registrationId, row])),
      }
    }
    case 'finals': {
      const results = await loadSeeding(resultsDeps, reporting, tournamentId)
      const division = results.divisions.find((item) => item.id === eventId)
      if (!division) throw new HttpError(404, 'Division not found')
      return {
        label: `Finals: ${division.name}`,
        date: null,
        divisionName: division.name,
        payees: finalsPayees(division),
        entered: new Map(
          division.rows.map((row) => [row.registrationId, { ...row, divisionName: division.name }]),
        ),
      }
    }
  }
}

/** The entries of a squad or sweeper, with their division names (D-269). */
function enteredBy(
  entries: readonly { registrationId: string; name: string; divisionId: string }[],
  divisions: readonly { id: string; name: string }[],
): Map<string, Entered> {
  const names = new Map(divisions.map((division) => [division.id, division.name]))
  return new Map(
    entries.map((entry) => [
      entry.registrationId,
      { name: entry.name, divisionName: names.get(entry.divisionId) ?? '' },
    ]),
  )
}

/** The names of an event's entered bowlers, for the messages of a save (PAY-12). */
export function namesOf(entered: ReadonlyMap<string, Entered>): Map<string, string> {
  return new Map([...entered].map(([id, bowler]) => [id, bowler.name]))
}

const viewOf = (record: PayoutRecord): PayoutView => ({
  id: record.id,
  amount: formatCents(record.amountCents),
  note: record.note,
  paid: record.paid,
})

/**
 * The entry sheet of one event (PAY-02 to PAY-06, D-272, D-273). A closed gate gives no rows; a
 * locked tournament shows the saved payouts read only. `null` for an unknown tournament or event.
 */
export async function loadSheet(
  deps: SheetDeps,
  reporting: Reporting,
  source: PayoutSource,
  tournamentId: string,
  eventId: string,
): Promise<PayoutSheet | null> {
  const facts = await deps.payouts.eventFacts(tournamentId, source, eventId)
  if ('notFound' in facts) return null

  const closed = gateReason(facts.gate)
  const eventKey = { source, eventId }
  if (closed && !facts.tournamentComplete) {
    // The gate is closed: there are no results to trust yet, so no rows (D-272).
    const empty = await labelOnly(deps, source, tournamentId, eventId)
    return {
      event: { ...eventKey, ...empty },
      status: 'notReady',
      reason: closed,
      payees: [],
      others: [],
      tournamentComplete: false,
    }
  }

  const worked = await workOutEvent(deps, reporting, source, tournamentId, eventId)
  const saved = (await deps.payouts.list(tournamentId)).filter(
    (record) => record.source === source && record.eventId === eventId,
  )
  const savedBy = new Map(saved.map((record) => [record.registrationId, record]))
  const inferred = new Set(worked.payees.map((payee) => payee.registrationId))

  const payees: SheetPayee[] = worked.payees.map((payee) => {
    const record = savedBy.get(payee.registrationId)
    return { ...payee, inferred: true, payout: record ? viewOf(record) : null }
  })
  // A bowler a director added by hand stays on the sheet (D-269).
  for (const record of saved) {
    if (inferred.has(record.registrationId)) continue
    const bowler = worked.entered.get(record.registrationId)
    payees.push({
      registrationId: record.registrationId,
      name: bowler?.name ?? 'Unknown bowler',
      divisionName: bowler?.divisionName ?? '',
      detail: 'added by hand',
      seed: null,
      previousCasher: false,
      inferred: false,
      payout: viewOf(record),
    })
  }
  const listed = new Set(payees.map((payee) => payee.registrationId))
  const others: SheetOther[] = [...worked.entered]
    .filter(([id]) => !listed.has(id))
    .map(([registrationId, bowler]) => ({
      registrationId,
      name: bowler.name,
      divisionName: bowler.divisionName,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

  return {
    event: {
      ...eventKey,
      label: worked.label,
      date: worked.date,
      divisionName: worked.divisionName,
    },
    status: facts.tournamentComplete ? 'locked' : 'open',
    reason: facts.tournamentComplete ? lockedMessage : null,
    payees,
    others,
    tournamentComplete: facts.tournamentComplete,
  }
}

/** The label and date of an event whose gate is closed, without working out any results. */
async function labelOnly(
  deps: SheetDeps,
  source: PayoutSource,
  tournamentId: string,
  eventId: string,
): Promise<{ label: string; date: string | null; divisionName: string | null }> {
  if (source === 'squad') {
    const squads = await deps.squads.listByTournament(tournamentId)
    return {
      label: 'Squad',
      date: squads.find((squad) => squad.id === eventId)?.date ?? null,
      divisionName: null,
    }
  }
  if (source === 'sweeper') {
    const sweepers = await deps.sweepers.listByTournament(tournamentId)
    return {
      label: 'Sweeper',
      date: sweepers.find((sweeper) => sweeper.id === eventId)?.date ?? null,
      divisionName: null,
    }
  }
  if (source === 'superSweeper') return { label: 'Super sweeper', date: null, divisionName: null }
  const divisions = await deps.divisions.listByTournament(tournamentId)
  const name = divisions.find((division) => division.id === eventId)?.name ?? ''
  return { label: `Finals: ${name}`, date: null, divisionName: name }
}
