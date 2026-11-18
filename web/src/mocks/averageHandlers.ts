import { http, HttpResponse } from 'msw'
import type { AverageRow } from '../features/averages/types'
import type { Division } from '../features/divisions/types'
import type { RegistrationList } from '../features/registrations/types'

/**
 * The demo average checks for `npm run dev:mocks` and the pull request build (AVG-02 to AVG-07). The
 * rows are the registrations in handicap divisions of the demo list; a verify, an adjust, or a
 * removal changes the list's rows too, so the Registrations page agrees. Held in memory until the page
 * reloads. The mock checks the same number, note, and division-limit rules as the API (D-291).
 */

interface Check {
  providedAverage: number | null
  verifiedAverage: number
  note: string | null
}

const message = {
  above: 'The verified average is above the division limit. Move the bowler to another division.',
  below: 'The verified average is below the division limit. Move the bowler to another division.',
  note: 'Say why the average changed, or where it came from.',
}

function averageProblem(value: unknown, division: Division | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value))
    return 'Average must be a whole number.'
  if (value < 1) return 'Average must be greater than 0.'
  if (value > 300) return 'Average must be less than or equal to 300.'
  if (division?.maximumAverage != null && value > division.maximumAverage) return message.above
  if (division?.minimumAverage != null && value < division.minimumAverage) return message.below
  return undefined
}

export function createAverageHandlers({
  divisions,
  registrations,
}: {
  divisions: Division[]
  registrations: RegistrationList
}) {
  const checks = new Map<string, Check>()
  const provided = new Map<string, number | null>()
  const when = new Map<string, string>()

  const rowOf = (registrationId: string) =>
    registrations.registrations.find((row) => row.id === registrationId)
  const providedOf = (registrationId: string) => {
    if (!provided.has(registrationId))
      provided.set(registrationId, rowOf(registrationId)?.average ?? null)
    return provided.get(registrationId) ?? null
  }

  /** Put the check into the registration row, as the API's list does (AVG-09, AVG-11). */
  function sync(registrationId: string) {
    const row = rowOf(registrationId)
    if (!row) return
    const check = checks.get(registrationId)
    row.average = check ? check.verifiedAverage : providedOf(registrationId)
    if (row.averageStatus !== 'none') {
      row.averageStatus = check ? (check.note === null ? 'verified' : 'adjusted') : 'unverified'
    }
  }

  const list = (): AverageRow[] =>
    registrations.registrations
      .filter((row) => row.averageStatus !== 'none')
      .map((row) => {
        const check = checks.get(row.id)
        return {
          registrationId: row.id,
          bowlerName: row.bowler.name,
          divisionName: row.divisionName,
          usbcId: row.bowler.usbcId,
          providedAverage: check ? check.providedAverage : providedOf(row.id),
          status: check ? (check.note === null ? 'verified' : 'adjusted') : 'unverified',
          averageInUse: check ? check.verifiedAverage : providedOf(row.id),
          note: check?.note ?? null,
          verifiedBy: check ? 'Demo Director' : null,
          verifiedAt: check ? (when.get(row.id) ?? null) : null,
        }
      })

  const answer = (registrationId: string) => {
    const row = rowOf(registrationId)
    return HttpResponse.json({
      registrationId,
      status: row?.averageStatus === 'none' ? 'unverified' : row?.averageStatus,
      averageInUse: row?.average ?? null,
    })
  }

  return [
    http.get('/v1/tournaments/:id/averages', () =>
      HttpResponse.json({ rows: list(), tournamentComplete: false }),
    ),
    http.put(
      '/v1/tournaments/:id/registrations/:registrationId/average-check',
      async ({ params, request }) => {
        const registrationId = String(params['registrationId'])
        const row = rowOf(registrationId)
        if (!row) return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
        const body: unknown = await request.json()
        const action =
          typeof body === 'object' && body !== null ? Reflect.get(body, 'action') : undefined
        if (action === 'verify') {
          const given = providedOf(registrationId)
          if (given === null) {
            const text = 'Enter an average with Adjust before it can be verified.'
            return HttpResponse.json({ message: text, errors: { average: text } }, { status: 400 })
          }
          checks.set(registrationId, { providedAverage: given, verifiedAverage: given, note: null })
        } else if (action === 'adjust') {
          const average: unknown = Reflect.get(body as object, 'average')
          const rawNote: unknown = Reflect.get(body as object, 'note')
          const note = typeof rawNote === 'string' ? rawNote.trim() : ''
          const errors: Record<string, string> = {}
          const problem = averageProblem(
            average,
            divisions.find((division) => division.id === row.divisionId),
          )
          if (problem) errors['average'] = problem
          if (note === '') errors['note'] = message.note
          if (Object.keys(errors).length > 0) {
            return HttpResponse.json(
              { message: Object.values(errors)[0] ?? 'Check the average.', errors },
              { status: 400 },
            )
          }
          checks.set(registrationId, {
            providedAverage: providedOf(registrationId),
            verifiedAverage: Number(average),
            note,
          })
        } else {
          return HttpResponse.json({ message: 'Invalid request' }, { status: 400 })
        }
        when.set(registrationId, new Date().toISOString())
        sync(registrationId)
        return answer(registrationId)
      },
    ),
    http.delete('/v1/tournaments/:id/registrations/:registrationId/average-check', ({ params }) => {
      const registrationId = String(params['registrationId'])
      if (!rowOf(registrationId)) {
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }
      if (!checks.delete(registrationId)) {
        return HttpResponse.json(
          { message: 'This registration has no average check to remove.' },
          { status: 400 },
        )
      }
      sync(registrationId)
      return answer(registrationId)
    }),
  ]
}
