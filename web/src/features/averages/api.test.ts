import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { createAverageRow } from '../../mocks/data'
import { server } from '../../mocks/server'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  AverageConfirmError,
  AverageFieldErrorsError,
  AverageNotFoundError,
  AverageRefusedError,
  fetchAverages,
  removeCheck,
  saveCheck,
} from './api'

const base = '/v1/tournaments/t1'
const check = `${base}/registrations/r1/average-check`

describe('fetchAverages (AVG-02)', () => {
  it('reads the rows and whether the tournament is complete', async () => {
    const row = createAverageRow({ registrationId: 'r1' })
    server.use(
      http.get(`${base}/averages`, () =>
        HttpResponse.json({ rows: [row], tournamentComplete: true }),
      ),
    )

    await expect(fetchAverages('t1')).resolves.toEqual({ rows: [row], tournamentComplete: true })
  })

  it('asks the path of the tournament, encoded', async () => {
    let asked = ''
    server.use(
      http.get('/v1/tournaments/:id/averages', ({ params }) => {
        asked = String(params['id'])
        return HttpResponse.json({ rows: [], tournamentComplete: false })
      }),
    )

    await fetchAverages('a b')

    expect(asked).toBe('a b')
  })

  it.each([
    ['a row with no name', { bowlerName: undefined }],
    ['a row with no registration id', { registrationId: undefined }],
    ['a row with no division', { divisionName: undefined }],
    ['a row with no USBC ID', { usbcId: undefined }],
    ['a provided average that is text', { providedAverage: 'x' }],
    ['a status it does not know', { status: 'approved' }],
    ['an average in use that is text', { averageInUse: 'x' }],
    ['a note that is a number', { note: 3 }],
    ['a checker that is a number', { verifiedBy: 3 }],
    ['a time that is a number', { verifiedAt: 3 }],
  ])('rejects %s', async (_name, change) => {
    server.use(
      http.get(`${base}/averages`, () =>
        HttpResponse.json({
          rows: [{ ...createAverageRow(), ...change }],
          tournamentComplete: false,
        }),
      ),
    )

    await expect(fetchAverages('t1')).rejects.toThrow(
      'Failed to load the averages (unexpected response)',
    )
  })

  it('rejects rows that are not a list, and a complete flag that is not true or false', async () => {
    server.use(
      http.get(`${base}/averages`, () =>
        HttpResponse.json({ rows: 'x', tournamentComplete: false }),
      ),
    )
    await expect(fetchAverages('t1')).rejects.toThrow('unexpected response')
    server.use(
      http.get(`${base}/averages`, () => HttpResponse.json({ rows: [], tournamentComplete: 'no' })),
    )
    await expect(fetchAverages('t1')).rejects.toThrow('unexpected response')
  })

  it('names a body that is not JSON', async () => {
    server.use(http.get(`${base}/averages`, () => new HttpResponse('nope')))

    await expect(fetchAverages('t1')).rejects.toThrow(
      'Failed to load the averages (response is not JSON)',
    )
  })

  it('says to sign in for a 401 and names the missing permission for a 403', async () => {
    server.use(http.get(`${base}/averages`, () => new HttpResponse(null, { status: 401 })))
    await expect(fetchAverages('t1')).rejects.toThrow('Sign in to check averages.')
    server.use(http.get(`${base}/averages`, () => new HttpResponse(null, { status: 403 })))
    await expect(fetchAverages('t1')).rejects.toThrow(
      'You do not have permission to check averages.',
    )
  })

  it('tells a missing tournament from another 404', async () => {
    server.use(
      http.get(`${base}/averages`, () =>
        HttpResponse.json({ message: 'Tournament not found' }, { status: 404 }),
      ),
    )
    await expect(fetchAverages('t1')).rejects.toBeInstanceOf(TournamentNotFoundError)

    server.use(
      http.get(`${base}/averages`, () =>
        HttpResponse.json({ message: 'Registration not found' }, { status: 404 }),
      ),
    )
    const other = await fetchAverages('t1').catch((error: unknown) => error)
    expect(other).toBeInstanceOf(AverageNotFoundError)
    expect((other as Error).message).toBe('Registration not found')
  })

  it('falls back to a plain message for a 404 with no body, and names other failures', async () => {
    server.use(http.get(`${base}/averages`, () => new HttpResponse(null, { status: 404 })))
    await expect(fetchAverages('t1')).rejects.toThrow('Failed to load the averages')
    server.use(http.get(`${base}/averages`, () => new HttpResponse(null, { status: 500 })))
    await expect(fetchAverages('t1')).rejects.toThrow('Failed to load the averages (500)')
  })
})

describe('saveCheck (AVG-03, AVG-04)', () => {
  it('sends a verify as a PUT with a JSON body', async () => {
    let seen: { method: string; type: string | null; body: unknown } | undefined
    server.use(
      http.put(check, async ({ request }) => {
        seen = {
          method: request.method,
          type: request.headers.get('content-type'),
          body: await request.json(),
        }
        return HttpResponse.json({})
      }),
    )

    await saveCheck('t1', 'r1', { action: 'verify' }, false)

    expect(seen).toEqual({ method: 'PUT', type: 'application/json', body: { action: 'verify' } })
  })

  it('adds confirmWarnings only when it confirms', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(check, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({})
      }),
    )

    await saveCheck('t1', 'r1', { action: 'adjust', average: 182, note: 'x' }, false)
    await saveCheck('t1', 'r1', { action: 'adjust', average: 182, note: 'x' }, true)

    expect(bodies).toEqual([
      { action: 'adjust', average: 182, note: 'x' },
      { action: 'adjust', average: 182, note: 'x', confirmWarnings: true },
    ])
  })

  it('throws the fields of a 400, with the first message', async () => {
    server.use(
      http.put(check, () =>
        HttpResponse.json(
          { message: 'First', errors: { average: 'First', note: 'Second', extra: 3 } },
          { status: 400 },
        ),
      ),
    )

    const failure = await saveCheck('t1', 'r1', { action: 'verify' }, false).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AverageFieldErrorsError)
    expect((failure as AverageFieldErrorsError).message).toBe('First')
    expect((failure as AverageFieldErrorsError).errors).toEqual({
      average: 'First',
      note: 'Second',
    })
  })

  it('uses a plain message and no fields for a 400 with neither', async () => {
    server.use(http.put(check, () => HttpResponse.json({}, { status: 400 })))

    const failure = await saveCheck('t1', 'r1', { action: 'verify' }, false).catch(
      (error: unknown) => error,
    )

    expect((failure as AverageFieldErrorsError).message).toBe('Failed to save the average')
    expect((failure as AverageFieldErrorsError).errors).toEqual({})
  })

  it('throws a confirm for a 409 with warnings, and a refusal for a 409 without', async () => {
    server.use(
      http.put(check, () =>
        HttpResponse.json({ message: 'Has scores', warnings: [{}] }, { status: 409 }),
      ),
    )
    const confirm = await saveCheck('t1', 'r1', { action: 'verify' }, false).catch(
      (error: unknown) => error,
    )
    expect(confirm).toBeInstanceOf(AverageConfirmError)
    expect((confirm as Error).message).toBe('Has scores')

    server.use(http.put(check, () => HttpResponse.json({ message: 'Complete' }, { status: 409 })))
    const refused = await saveCheck('t1', 'r1', { action: 'verify' }, false).catch(
      (error: unknown) => error,
    )
    expect(refused).toBeInstanceOf(AverageRefusedError)
    expect((refused as Error).message).toBe('Complete')

    server.use(http.put(check, () => HttpResponse.json({}, { status: 409 })))
    await expect(saveCheck('t1', 'r1', { action: 'verify' }, false)).rejects.toThrow(
      'Failed to save the average',
    )
  })

  it('names the common failures and the others', async () => {
    server.use(http.put(check, () => new HttpResponse(null, { status: 403 })))
    await expect(saveCheck('t1', 'r1', { action: 'verify' }, false)).rejects.toThrow(
      'You do not have permission to check averages.',
    )
    server.use(
      http.put(check, () =>
        HttpResponse.json({ message: 'Registration not found' }, { status: 404 }),
      ),
    )
    await expect(saveCheck('t1', 'r1', { action: 'verify' }, false)).rejects.toBeInstanceOf(
      AverageNotFoundError,
    )
    server.use(http.put(check, () => new HttpResponse(null, { status: 500 })))
    await expect(saveCheck('t1', 'r1', { action: 'verify' }, false)).rejects.toThrow(
      'Failed to save the average (500)',
    )
  })
})

describe('removeCheck (AVG-07)', () => {
  it('sends a DELETE, and asks to confirm in the address', async () => {
    const asked: { method: string; search: string }[] = []
    server.use(
      http.delete(check, ({ request }) => {
        asked.push({ method: request.method, search: new URL(request.url).search })
        return HttpResponse.json({})
      }),
    )

    await removeCheck('t1', 'r1', false)
    await removeCheck('t1', 'r1', true)

    expect(asked).toEqual([
      { method: 'DELETE', search: '' },
      { method: 'DELETE', search: '?confirmWarnings=true' },
    ])
  })

  it('throws a confirm, a refusal, and a plain failure', async () => {
    server.use(
      http.delete(check, () =>
        HttpResponse.json({ message: 'Has scores', warnings: [{}] }, { status: 409 }),
      ),
    )
    await expect(removeCheck('t1', 'r1', false)).rejects.toBeInstanceOf(AverageConfirmError)
    server.use(
      http.delete(check, () => HttpResponse.json({ message: 'Complete' }, { status: 409 })),
    )
    await expect(removeCheck('t1', 'r1', false)).rejects.toBeInstanceOf(AverageRefusedError)
    server.use(http.delete(check, () => new HttpResponse(null, { status: 500 })))
    await expect(removeCheck('t1', 'r1', false)).rejects.toThrow('Failed to remove the check (500)')
  })
})
