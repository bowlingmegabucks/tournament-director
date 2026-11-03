import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { CreateUserError, createUser, fetchUserOptions } from './api'

const input = { name: 'Bea', email: 'bea@example.com', roles: ['director'] }

describe('fetchUserOptions', () => {
  it('returns the roles and the email flag', async () => {
    await expect(fetchUserOptions()).resolves.toEqual({
      roles: ['scoreKeeper', 'director', 'admin'],
      inviteEmail: true,
    })
  })

  it.each([
    ['not JSON', () => new HttpResponse('oops')],
    ['no roles', () => HttpResponse.json({ inviteEmail: true })],
    ['roles that are not text', () => HttpResponse.json({ roles: [1], inviteEmail: true })],
    ['no email flag', () => HttpResponse.json({ roles: [] })],
  ])('rejects a response with %s', async (_label, respond) => {
    server.use(http.get('/v1/users/options', respond))

    await expect(fetchUserOptions()).rejects.toThrow(/could not be loaded/)
  })

  it('rejects a failed status', async () => {
    server.use(http.get('/v1/users/options', () => new HttpResponse(null, { status: 403 })))

    await expect(fetchUserOptions()).rejects.toThrow(
      'The user options could not be loaded. Try again.',
    )
  })
})

describe('createUser', () => {
  it('returns the user the API made', async () => {
    server.use(
      http.post('/v1/users', () =>
        HttpResponse.json(
          { id: 'u1', email: input.email, name: input.name, roles: input.roles },
          { status: 201 },
        ),
      ),
    )

    await expect(createUser(input)).resolves.toEqual({ id: 'u1', ...input })
  })

  it.each([
    [400, 'Invalid request. roles: pick at least one role'],
    [409, 'A user with this email already exists.'],
    [502, 'The invite email could not be sent, so the user was not added. Try again.'],
    [503, 'Email is not set up on the server, so no invite can be sent.'],
  ])('shows the API message for a %i', async (status, message) => {
    server.use(http.post('/v1/users', () => HttpResponse.json({ message }, { status })))

    await expect(createUser(input)).rejects.toThrow(new CreateUserError(message))
  })

  it.each([
    [401, 'You are signed out. Sign in again and retry.'],
    [403, 'Only an admin can add users.'],
    [500, 'The user could not be added. Try again.'],
  ])('uses its own words for a %i', async (status, message) => {
    server.use(
      http.post('/v1/users', () => HttpResponse.json({ message: 'internal detail' }, { status })),
    )

    await expect(createUser(input)).rejects.toThrow(message)
  })

  it('uses the general message for an error body that is not JSON or has no message', async () => {
    server.use(http.post('/v1/users', () => new HttpResponse('<html>', { status: 502 })))
    await expect(createUser(input)).rejects.toThrow('The user could not be added. Try again.')

    server.use(http.post('/v1/users', () => HttpResponse.json({}, { status: 409 })))
    await expect(createUser(input)).rejects.toThrow('The user could not be added. Try again.')
  })

  it('says so when the server cannot be reached', async () => {
    server.use(http.post('/v1/users', () => HttpResponse.error()))

    await expect(createUser(input)).rejects.toThrow('Could not reach the server. Try again.')
  })

  it('warns that the user may exist when the success answer is unreadable', async () => {
    server.use(http.post('/v1/users', () => HttpResponse.json({ id: 1 }, { status: 201 })))

    await expect(createUser(input)).rejects.toThrow(
      'The user was added, but the answer could not be read.',
    )
  })
})
