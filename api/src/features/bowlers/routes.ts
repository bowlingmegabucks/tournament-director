import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { RegistrationWriter } from '../registrations/writer.ts'
import type { BowlerRepository } from './repository.ts'
import type { BowlerFilter, BowlerResponse } from './types.ts'

// A box left empty reaches the API as "": it means "not asked".
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional()

const searchQuery = z.object({
  lastName: optionalText,
  firstName: optionalText,
  email: optionalText,
  usbcId: optionalText,
  tournamentId: z.uuid().optional(),
})

const idParams = z.object({ id: z.uuid() })
const detailQuery = z.object({ tournamentId: z.uuid().optional() })

export const needFilterMessage = 'Enter at least one search field.'

/**
 * Mounted at `/v1/bowlers`, behind `bowlers.read` (D-157). Web only, never the vendor contract
 * (D-09); the API key cannot reach it. Never returns the SSN (BWL-17). The search lists bowlers
 * (BWL-14); the detail fills the desk form and says whether the bowler is already registered in
 * one tournament (REG-01, D-165).
 */
export function createBowlerRouter(
  bowlers: BowlerRepository,
  writer: RegistrationWriter,
  divisions: DivisionRepository,
): Router {
  const router = Router()

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const query = searchQuery.parse(req.query)
    const { tournamentId, ...fields } = query
    // A search with no field would read the whole table; the desk is not meant to browse it.
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new HttpError(400, needFilterMessage)
    }
    const filter: BowlerFilter = { ...stripUndefined(fields), tournamentId }
    res.json(await bowlers.search(filter))
  })

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const { tournamentId } = detailQuery.parse(req.query)
    const bowler = await writer.findBowlerById(id)
    if (!bowler) throw new HttpError(404, 'Bowler not found')

    const stored = tournamentId ? await writer.findRegistration(id, tournamentId) : undefined
    let registration: BowlerResponse['registration'] = null
    if (stored && tournamentId) {
      const [sessions, tournamentDivisions, scoredIds] = await Promise.all([
        writer.findSessions(stored.sessionIds),
        divisions.listByTournament(tournamentId),
        writer.findScoredSessionIds(id),
      ])
      // Scores from an earlier tournament do not count here (D-160).
      const scored = await writer.findSessions(scoredIds)
      registration = {
        id: stored.id,
        divisionId: stored.divisionId,
        divisionName:
          tournamentDivisions.find((division) => division.id === stored.divisionId)?.name ?? '',
        average: stored.average,
        superSweeper: stored.superSweeper,
        squadIds: sessions.filter((s) => s.kind === 'squad').map((s) => s.id),
        sweeperIds: sessions.filter((s) => s.kind === 'sweeper').map((s) => s.id),
        hasScores: scored.some((session) => session.tournamentId === tournamentId),
      }
    }

    const response: BowlerResponse = {
      bowler: {
        id: bowler.id,
        firstName: bowler.firstName,
        middleInitial: bowler.middleInitial,
        lastName: bowler.lastName,
        suffix: bowler.suffix,
        street: bowler.street,
        city: bowler.city,
        state: bowler.state,
        zipCode: bowler.zipCode,
        email: bowler.email,
        phoneNumber: bowler.phoneNumber,
        usbcId: bowler.usbcId,
        dateOfBirth: bowler.dateOfBirth ?? '',
        gender: bowler.gender ?? '',
      },
      registration,
    }
    res.json(response)
  })

  return router
}

function stripUndefined<T extends Record<string, string | undefined>>(
  fields: T,
): Partial<Record<keyof T, string>> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Record<keyof T, string>>
}
