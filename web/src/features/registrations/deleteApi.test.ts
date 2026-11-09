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
