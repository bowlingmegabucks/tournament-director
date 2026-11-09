import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createDeleteInfo } from '../../mocks/data'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import {
  deleteRegistration,
  fetchDeleteInfo,
  RegistrationDeleteRefusedError,
  RegistrationPaidWarningError,
} from './deleteApi'
import { RegistrationNotFoundError } from './editApi'

const path = '/v1/tournaments/t1/registrations/r1'

describe('fetchDeleteInfo (D-212)', () => {
  it('returns the fees and the real payments, asking for the right path', async () => {
    const info = createDeleteInfo({
      payments: [{ system: 'BowlingSite', amount: 85 }],
      paidTotal: 85,
    })
    let asked = ''
    server.use(
      http.get(`${path}/delete-info`, ({ request }) => {
        asked = new URL(request.url).pathname
        return HttpResponse.json({ deleteInfo: info })
      }),
    )

    expect(await fetchDeleteInfo('t1', 'r1')).toEqual(info)
    expect(asked).toBe(`${path}/delete-info`)
  })

  it('encodes the ids in the path', async () => {
    let asked = ''
    server.use(
      http.get('/v1/tournaments/:id/registrations/:rid/delete-info', ({ request }) => {
        asked = new URL(request.url).pathname
        return HttpResponse.json({ deleteInfo: createDeleteInfo() })
      }),
    )

    await fetchDeleteInfo('a/b', 'c d')

    expect(asked).toBe('/v1/tournaments/a%2Fb/registrations/c%20d/delete-info')
  })

  it.each([
    [
      'a missing registration',
      404,
      { message: 'Registration not found' },
      RegistrationNotFoundError,
    ],
    ['a missing tournament', 404, { message: 'Tournament not found' }, TournamentNotFoundError],
    ['a bad id', 400, { message: 'bad' }, RegistrationNotFoundError],
  ])('throws for %s', async (_name, status, body, expected) => {
    server.use(http.get(`${path}/delete-info`, () => HttpResponse.json(body, { status })))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toBeInstanceOf(expected)
  })

  it.each([
    [401, 'Sign in to delete a registration.'],
    [403, 'You do not have permission to delete a registration.'],
    [500, 'Failed to load the registration (500)'],
  ])('says what went wrong for %s', async (status, message) => {
    server.use(http.get(`${path}/delete-info`, () => new HttpResponse(null, { status })))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toThrow(message)
  })

  const withInfo = (changes: Record<string, unknown>) => ({
    deleteInfo: { ...createDeleteInfo(), ...changes },
  })
  const goodEntry = () => createDeleteInfo().entries[0]

  it.each([
    ['a bowler name that is not text', withInfo({ bowlerName: 5 })],
    ['a division name that is not text', withInfo({ divisionName: 5 })],
    ['a tournamentComplete that is not a flag', withInfo({ tournamentComplete: 'no' })],
    ['entries that are not a list', withInfo({ entries: 'none' })],
    ['an entry id that is not text', withInfo({ entries: [{ ...goodEntry(), id: 1 }] })],
    ['an entry kind that is not a kind', withInfo({ entries: [{ ...goodEntry(), kind: 'x' }] })],
    ['an entry date that is not text', withInfo({ entries: [{ ...goodEntry(), date: 5 }] })],
    [
      'an entry fee that is not a number',
      withInfo({ entries: [{ ...goodEntry(), entryFee: '60' }] }),
    ],
    [
      'one bad entry among good ones',
      withInfo({ entries: [goodEntry(), { ...goodEntry(), id: 1 }] }),
    ],
    ['an entries total that is not a number', withInfo({ entriesTotal: '85' })],
    ['payments that are not a list', withInfo({ payments: 'none' })],
    ['a payment system that is not text', withInfo({ payments: [{ system: 1, amount: 5 }] })],
    [
      'a payment amount that is not a number',
      withInfo({ payments: [{ system: 'x', amount: '5' }] }),
    ],
    [
      'one bad payment among good ones',
      withInfo({
        payments: [
          { system: 'x', amount: 5 },
          { system: 1, amount: 5 },
        ],
      }),
    ],
    ['a paid total that is not a number', withInfo({ paidTotal: null })],
  ])('rejects a reply with %s', async (_name, body) => {
    server.use(http.get(`${path}/delete-info`, () => HttpResponse.json(body)))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toThrow('unexpected response')
  })

  it('says so when a good status carries something that is not JSON', async () => {
    server.use(http.get(`${path}/delete-info`, () => new HttpResponse('nope')))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toThrow('Failed to load the registration')
  })

  it('treats a 404 with no JSON as a missing tournament', async () => {
    server.use(http.get(`${path}/delete-info`, () => new HttpResponse('nope', { status: 404 })))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it.each([
    ['no deleteInfo', {}],
    ['a missing total', { deleteInfo: { ...createDeleteInfo(), paidTotal: undefined } }],
    ['a bad entry', { deleteInfo: { ...createDeleteInfo(), entries: [{ id: 1 }] } }],
    [
      'a bad payment',
      { deleteInfo: { ...createDeleteInfo(), payments: [{ system: 'x' }], paidTotal: 1 } },
    ],
    ['a flag that is not a flag', { deleteInfo: { ...createDeleteInfo(), hasScores: 'no' } }],
  ])('rejects a reply with %s', async (_name, body) => {
    server.use(http.get(`${path}/delete-info`, () => HttpResponse.json(body)))

    await expect(fetchDeleteInfo('t1', 'r1')).rejects.toThrow('unexpected response')
  })
})

describe('deleteRegistration (REG-19, D-209 to D-211)', () => {
  it('sends a bare DELETE with no real payment and resolves on 204', async () => {
    let seen = ''
    server.use(
      http.delete(path, ({ request }) => {
        seen = new URL(request.url).search
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteRegistration('t1', 'r1')).resolves.toBeUndefined()
    expect(seen).toBe('')
  })

  it('sends the confirm and the total paid with two decimals (D-210)', async () => {
    let seen = ''
    server.use(
      http.delete(path, ({ request }) => {
        seen = new URL(request.url).search
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteRegistration('t1', 'r1', 85)

    expect(seen).toBe('?confirmWarnings=true&paid=85.00')
  })

  it('throws the paid warning with the stored total (D-210)', async () => {
    server.use(
      http.delete(path, () =>
        HttpResponse.json(
          {
            message: 'Confirm to delete this registration.',
            warnings: [{ field: 'registration', message: 'Paid.' }],
            paid: 145.5,
          },
          { status: 409 },
        ),
      ),
    )

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RegistrationPaidWarningError)
    expect(error).toMatchObject({ paid: 145.5, message: 'Confirm to delete this registration.' })
  })

  it('throws a refusal with every reason (D-211)', async () => {
    server.use(
      http.delete(path, () =>
        HttpResponse.json(
          { message: 'first', errors: { tournament: 'first', scores: 'second' } },
          { status: 409 },
        ),
      ),
    )

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RegistrationDeleteRefusedError)
    expect(error).toMatchObject({ reasons: ['first', 'second'], message: 'first' })
  })

  it('keeps only the reasons that are text', async () => {
    server.use(
      http.delete(path, () =>
        HttpResponse.json(
          { message: 'm', errors: { tournament: 'Only this.', scores: 5 } },
          { status: 409 },
        ),
      ),
    )

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ reasons: ['Only this.'] })
  })

  it('falls back to the message when the errors hold no text', async () => {
    server.use(
      http.delete(path, () =>
        HttpResponse.json({ message: 'Why not.', errors: {} }, { status: 409 }),
      ),
    )

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ reasons: ['Why not.'] })
  })

  it('names the delete in its own words when a 409 has no message', async () => {
    server.use(http.delete(path, () => HttpResponse.json({}, { status: 409 })))

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      message: 'The registration cannot be deleted.',
      reasons: ['The registration cannot be deleted.'],
    })
  })

  it('says so when a 409 carries something that is not JSON', async () => {
    server.use(http.delete(path, () => new HttpResponse('nope', { status: 409 })))

    await expect(deleteRegistration('t1', 'r1')).rejects.toThrow(
      'Failed to delete the registration',
    )
  })

  it('treats a 404 with no JSON as a missing tournament', async () => {
    server.use(http.delete(path, () => new HttpResponse('nope', { status: 404 })))

    await expect(deleteRegistration('t1', 'r1')).rejects.toBeInstanceOf(TournamentNotFoundError)
  })

  it('falls back to the message when a 409 names no reasons', async () => {
    server.use(http.delete(path, () => HttpResponse.json({ message: 'No.' }, { status: 409 })))

    const error: unknown = await deleteRegistration('t1', 'r1').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ reasons: ['No.'] })
  })

  it.each([
    [
      'a missing registration',
      404,
      { message: 'Registration not found' },
      RegistrationNotFoundError,
    ],
    ['a missing tournament', 404, { message: 'Tournament not found' }, TournamentNotFoundError],
  ])('throws for %s', async (_name, status, body, expected) => {
    server.use(http.delete(path, () => HttpResponse.json(body, { status })))

    await expect(deleteRegistration('t1', 'r1')).rejects.toBeInstanceOf(expected)
  })

  it.each([
    [400, 'The registration cannot be deleted.'],
    [401, 'Sign in to delete a registration.'],
    [403, 'You do not have permission to delete a registration.'],
    [503, 'Failed to delete the registration (503)'],
  ])('says what went wrong for %s', async (status, message) => {
    server.use(http.delete(path, () => new HttpResponse(null, { status })))

    await expect(deleteRegistration('t1', 'r1')).rejects.toThrow(message)
  })
})
