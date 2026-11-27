import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  applyNoShow,
  NoShowChangedError,
  NoShowRefusedError,
  previewNoShow,
  type NoShowTarget,
} from './api'
import type { Choice, Preview } from './types'

const target: NoShowTarget = { tournamentId: 't 1', squadId: 's1', registrationId: 'r1' }
const choice: Choice = { action: 'refund', keepAdvancing: [] }
const preview: Preview = {
  action: 'refund',
  bowlerName: 'Nora Noshow',
  source: { id: 's1', date: '2026-11-26T08:00:00' },
  target: null,
  deletesRegistration: false,
  warnings: [],
  changes: [],
  keepAdvancing: [],
  atLarge: [],
  payouts: [],
  version: 'v1',
}

const base = '/v1/tournaments/t%201/squads/s1/no-shows/r1'

const answer = (status: number, body?: object) => {
  const reply = () =>
    body === undefined ? new HttpResponse(null, { status }) : HttpResponse.json(body, { status })
  server.use(http.post(`${base}/preview`, reply), http.post(base, reply))
}

describe('previewNoShow', () => {
  it('sends the choice and returns the preview', async () => {
    let sent: unknown
    server.use(
      http.post(`${base}/preview`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ preview })
      }),
    )

    await expect(previewNoShow(target, choice)).resolves.toEqual(preview)
    expect(sent).toEqual(choice)
  })

  it.each([
    [401, 'Sign in to change this entry.'],
    [403, 'Only an admin can move or refund a no-show.'],
    [500, 'Failed to change the entry (500)'],
  ])('says what a %i means', async (status, message) => {
    answer(status)

    await expect(previewNoShow(target, choice)).rejects.toThrow(message)
  })

  it('refuses an answer that is not a preview', async () => {
    answer(200, { preview: { bowlerName: 'Nora' } })

    await expect(previewNoShow(target, choice)).rejects.toThrow('unexpected response')
  })

  it('tells a refusal from a change', async () => {
    answer(409, { message: 'Remove the payout first.', errors: {} })
    await expect(previewNoShow(target, choice)).rejects.toBeInstanceOf(NoShowRefusedError)

    answer(409, { message: 'Changed', preview })
    await expect(previewNoShow(target, choice)).rejects.toBeInstanceOf(NoShowChangedError)
  })
})

describe('applyNoShow', () => {
  it('sends the choice with the reviewed version', async () => {
    let sent: unknown
    server.use(
      http.post(base, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ deletedRegistration: false })
      }),
    )

    await applyNoShow(target, choice, 'v1')

    expect(sent).toEqual({ ...choice, version: 'v1' })
  })
})
