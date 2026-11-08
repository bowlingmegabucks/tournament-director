import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  fetchSessionEditInfo,
  patchSession,
  SessionRejectedError,
  SessionWarningsError,
} from './sessionEditApi'
import { TournamentNotFoundError } from './tournamentQuery'

const patchPath = '/v1/tournaments/:id/:kind/:sessionId'

describe('patchSession (SQD-23, D-184)', () => {
  it('patches the session of the tournament with only the changes and returns the session', async () => {
    let seen: { params: unknown; body: unknown; method: string } | undefined
    server.use(
      http.patch(patchPath, async ({ params, request }) => {
        seen = { params, body: await request.json(), method: request.method }
        return HttpResponse.json({ squad: { id: 'x' } })
      }),
    )

    await expect(patchSession('squads', 't 1', 's/1', { maxPerPair: 3 })).resolves.toEqual({
      id: 'x',
    })

    expect(seen).toEqual({
      params: { id: 't 1', kind: 'squads', sessionId: 's/1' },
      body: { maxPerPair: 3 },
      method: 'PATCH',
    })
  })

  it('reads the sweeper under its own key', async () => {
    server.use(http.patch(patchPath, () => HttpResponse.json({ sweeper: { id: 'w' } })))

    await expect(patchSession('sweepers', 't', 's', {})).resolves.toEqual({ id: 'w' })
  })

  it('adds confirmWarnings only when told to (D-129)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(patchPath, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ squad: {} })
      }),
    )

    await patchSession('squads', 't', 's', { a: 1 })
    await patchSession('squads', 't', 's', { a: 1 }, true)

    expect(bodies).toEqual([{ a: 1 }, { a: 1, confirmWarnings: true }])
  })

  it.each([400, 409])(
    'throws SessionRejectedError with the messages for status %i',
    async (status) => {
      server.use(
        http.patch(patchPath, () =>
          HttpResponse.json(
            {
              message: 'No',
              errors: {
                date: 'A date',
                'bonusPins.d1': 'A pin',
                tournament: 'Tournament done',
                session: 'Squad done',
                ignored: 5,
              },
            },
            { status },
          ),
        ),
      )

      const error = await patchSession('squads', 't', 's', {}).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(SessionRejectedError)
      expect(error).toMatchObject({
        message: 'No',
        errors: {
          date: 'A date',
          'bonusPins.d1': 'A pin',
          tournament: 'Tournament done',
          session: 'Squad done',
        },
        tournament: 'Tournament done',
        session: 'Squad done',
      })
      expect((error as SessionRejectedError).errors).not.toHaveProperty('ignored')
    },
  )

  it('leaves tournament and session undefined when the refusal is about fields', async () => {
    server.use(
      http.patch(patchPath, () =>
        HttpResponse.json({ message: 'No', errors: { date: 'A date' } }, { status: 409 }),
      ),
    )

    const error = (await patchSession('squads', 't', 's', {}).catch(
      (e: unknown) => e,
    )) as SessionRejectedError

    expect(error.tournament).toBeUndefined()
    expect(error.session).toBeUndefined()
  })

  it('throws SessionWarningsError with the warnings for a 409 that asks to confirm (D-129)', async () => {
    const warnings = [{ field: 'entryFee', message: 'They keep what they paid.' }]
    server.use(
      http.patch(patchPath, () =>
        HttpResponse.json({ message: 'Confirm', warnings }, { status: 409 }),
      ),
    )

    const error = await patchSession('squads', 't', 's', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(SessionWarningsError)
    expect((error as SessionWarningsError).warnings).toEqual(warnings)
  })

  it('falls back to field errors when the warnings are malformed or empty', async () => {
    for (const warnings of [[], [{ field: 1 }], 'x']) {
      server.use(
        http.patch(patchPath, () =>
          HttpResponse.json({ message: 'No', warnings, errors: {} }, { status: 409 }),
        ),
      )
      await expect(patchSession('squads', 't', 's', {})).rejects.toBeInstanceOf(
        SessionRejectedError,
      )
    }
  })

  it('gives each failure its own words, by kind', async () => {
    const answer = (status: number) =>
      server.use(http.patch(patchPath, () => new HttpResponse(null, { status })))

    answer(404)
    await expect(patchSession('squads', 't', 's', {})).rejects.toThrow(
      'This squad was not found. It may have been removed.',
    )
    answer(401)
    await expect(patchSession('sweepers', 't', 's', {})).rejects.toThrow(
      'Sign in to edit a sweeper.',
    )
    answer(403)
    await expect(patchSession('squads', 't', 's', {})).rejects.toThrow(
      'You do not have permission to edit a squad.',
    )
    answer(503)
    await expect(patchSession('sweepers', 't', 's', {})).rejects.toThrow(
      'Failed to save the sweeper (503)',
    )
  })
})

describe('fetchSessionEditInfo (SQD-26)', () => {
  const path = '/v1/tournaments/:id/:kind/:sessionId/edit-info'
  const info = {
    entryCount: 12,
    assignmentCount: 4,
    hasScores: true,
    lowestAssignedLane: 3,
    highestAssignedLane: 16,
    fullestPair: 3,
  }

  it('reads the counts and the lane facts, asking for the right session', async () => {
    let asked: unknown
    server.use(
      http.get(path, ({ params }) => {
        asked = params
        return HttpResponse.json({ editInfo: info })
      }),
    )

    await expect(fetchSessionEditInfo('sweepers', 't 1', 's/1')).resolves.toEqual(info)

    expect(asked).toEqual({ id: 't 1', kind: 'sweepers', sessionId: 's/1' })
  })

  it('accepts null lane facts', async () => {
    const empty = {
      ...info,
      assignmentCount: 0,
      lowestAssignedLane: null,
      highestAssignedLane: null,
      fullestPair: null,
    }
    server.use(http.get(path, () => HttpResponse.json({ editInfo: empty })))

    await expect(fetchSessionEditInfo('squads', 't', 's')).resolves.toEqual(empty)
  })

  it('reports not found for 404, so the page stops retrying', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 404 })))

    await expect(fetchSessionEditInfo('squads', 't', 's')).rejects.toBeInstanceOf(
      TournamentNotFoundError,
    )
  })

  it('throws for another failure status and for a wrong shape', async () => {
    server.use(http.get(path, () => new HttpResponse(null, { status: 500 })))
    await expect(fetchSessionEditInfo('squads', 't', 's')).rejects.toThrow(
      'Failed to load the squad (500)',
    )

    for (const wrong of [
      { ...info, entryCount: '1' },
      { ...info, assignmentCount: undefined },
      { ...info, hasScores: 'yes' },
      { ...info, lowestAssignedLane: 'a' },
      { ...info, highestAssignedLane: undefined },
      { ...info, fullestPair: 'b' },
    ]) {
      server.use(http.get(path, () => HttpResponse.json({ editInfo: wrong })))
      await expect(fetchSessionEditInfo('sweepers', 't', 's')).rejects.toThrow(
        'Failed to load the sweeper (unexpected response)',
      )
    }
  })
})

describe('patchSession: what goes on the wire and how it fails (SQD-23)', () => {
  it('sends the body as JSON', async () => {
    let type: string | null = null
    server.use(
      http.patch(patchPath, ({ request }) => {
        type = request.headers.get('content-type')
        return HttpResponse.json({ squad: {} })
      }),
    )

    await patchSession('squads', 't', 's', { a: 1 })

    expect(type).toBe('application/json')
  })

  it('says which kind could not be read when a body is not JSON', async () => {
    server.use(http.patch(patchPath, () => new HttpResponse('nope', { status: 409 })))
    await expect(patchSession('squads', 't', 's', {})).rejects.toThrow(
      'Failed to save the squad (response is not JSON)',
    )

    server.use(http.patch(patchPath, () => new HttpResponse('nope', { status: 200 })))
    await expect(patchSession('sweepers', 't', 's', {})).rejects.toThrow(
      'Failed to save the sweeper (response is not JSON)',
    )
  })

  it('names the kind when the API sends no message', async () => {
    server.use(http.patch(patchPath, () => HttpResponse.json({ errors: {} }, { status: 400 })))

    await expect(patchSession('squads', 't', 's', {})).rejects.toThrow(
      'The squad was not accepted.',
    )
    await expect(patchSession('sweepers', 't', 's', {})).rejects.toThrow(
      'The sweeper was not accepted.',
    )
  })
})

describe('fetchSessionEditInfo: a body that is not JSON (SQD-26)', () => {
  it('says which kind could not be read', async () => {
    server.use(
      http.get(
        '/v1/tournaments/:id/:kind/:sessionId/edit-info',
        () => new HttpResponse('nope', { status: 200 }),
      ),
    )

    await expect(fetchSessionEditInfo('squads', 't', 's')).rejects.toThrow(
      'Failed to load the squad (response is not JSON)',
    )
  })
})
