import { http, HttpResponse } from 'msw'
import type { Choice, Preview } from '../features/noShows/types'
import type { Squad } from '../features/squads/types'

/**
 * The mock twin of the no-show routes (NSH-09): one second casher drops out, and the bowler leaves
 * the list once saved. `removed` holds the registrations moved or refunded.
 */
export function createNoShowHandlers(squads: Squad[], removed: Set<string>) {
  const previewOf = (squadId: string, choice: Choice): Preview => {
    const source = squads.find((squad) => squad.id === squadId)
    const date = source?.date ?? '2026-10-24T09:00:00'
    const target =
      choice.action === 'move' ? squads.find((squad) => squad.id === choice.targetSquadId) : null
    return {
      action: choice.action,
      bowlerName: 'Mike Tran',
      source: { id: squadId, date },
      target: target ? { id: target.id, date: target.date } : null,
      deletesRegistration: choice.action === 'refund',
      warnings:
        choice.action === 'refund'
          ? [
              'This is their only squad entry. Refunding it makes them ineligible for sweepers and deletes the registration, including every sweeper entry.',
            ]
          : [],
      changes: [
        {
          squadId,
          squadDate: date,
          divisionName: 'Open',
          registrationId: '8a2d5f31-0c4b-4a77-b1de-6f90c3a2e451',
          name: 'Dana Whitfield',
          change: 'losesCash',
        },
      ],
      keepAdvancing: [],
      atLarge: [],
      payouts: [],
      version: JSON.stringify(choice),
    }
  }

  return [
    http.post(
      '/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId/preview',
      async ({ params, request }) => {
        const choice = (await request.json()) as Choice
        return HttpResponse.json({ preview: previewOf(String(params.sessionId), choice) })
      },
    ),
    http.post(
      '/v1/tournaments/:id/squads/:sessionId/no-shows/:registrationId',
      async ({ params, request }) => {
        const choice = (await request.json()) as Choice
        removed.add(String(params.registrationId))
        return HttpResponse.json({ deletedRegistration: choice.action === 'refund' })
      },
    ),
  ]
}
