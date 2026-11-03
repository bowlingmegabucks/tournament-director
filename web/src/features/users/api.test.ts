import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import {
  CreateUserError,
  EditUserError,
  ResetPasswordError,
  createUser,
  fetchUserOptions,
  fetchUsers,
  sendPasswordReset,
  setUserDisabled,
  updateUserRoles,
} from './api'

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

describe('fetchUsers', () => {
  it('returns the users', async () => {
    await expect(fetchUsers()).resolves.toHaveLength(3)
  })

  it.each([
    ['no users field', () => HttpResponse.json({})],
    [
      'a user with no disabled flag',
      () => HttpResponse.json({ users: [{ id: 'a', email: 'a', name: 'a', roles: [] }] }),
    ],
    ['not JSON', () => new HttpResponse('oops')],
  ])('rejects a response with %s', async (_label, respond) => {
    server.use(http.get('/v1/users', respond))

    await expect(fetchUsers()).rejects.toThrow(/could not be loaded/)
  })

  it('rejects a failed status', async () => {
    server.use(http.get('/v1/users', () => new HttpResponse(null, { status: 403 })))

    await expect(fetchUsers()).rejects.toThrow('The users could not be loaded. Try again.')
  })
})

describe('sendPasswordReset', () => {
  it('resolves on a 204', async () => {
    await expect(sendPasswordReset('u-ada')).resolves.toBeUndefined()
  })

  it('encodes the id in the address', async () => {
    let url = ''
    server.use(
      http.post('/v1/users/:id/password-reset', ({ request }) => {
        url = request.url
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await sendPasswordReset('a/b')

    expect(url).toContain('/v1/users/a%2Fb/password-reset')
  })

  it.each([
    [401, 'You are signed out. Sign in again and retry.'],
    [403, 'Only an admin can reset passwords.'],
    [404, 'That user no longer exists. Reload the list.'],
    [500, 'The reset link could not be sent. Try again.'],
  ])('uses its own words for a %i', async (status, message) => {
    server.use(
      http.post('/v1/users/:id/password-reset', () =>
        HttpResponse.json({ message: 'internal detail' }, { status }),
      ),
    )

    await expect(sendPasswordReset('u-ada')).rejects.toThrow(new ResetPasswordError(message))
  })

  it.each([502, 503])('shows the API message for a %i', async (status) => {
    server.use(
      http.post('/v1/users/:id/password-reset', () =>
        HttpResponse.json({ message: 'Mail is down.' }, { status }),
      ),
    )

    await expect(sendPasswordReset('u-ada')).rejects.toThrow('Mail is down.')
  })

  it('uses the general message when a 502 has no readable message', async () => {
    server.use(
      http.post('/v1/users/:id/password-reset', () => new HttpResponse('<html>', { status: 502 })),
    )
    await expect(sendPasswordReset('u-ada')).rejects.toThrow(
      'The reset link could not be sent. Try again.',
    )

    server.use(
      http.post('/v1/users/:id/password-reset', () => HttpResponse.json({}, { status: 503 })),
    )
    await expect(sendPasswordReset('u-ada')).rejects.toThrow(
      'The reset link could not be sent. Try again.',
    )
  })

  it('says so when the server cannot be reached', async () => {
    server.use(http.post('/v1/users/:id/password-reset', () => HttpResponse.error()))

    await expect(sendPasswordReset('u-ada')).rejects.toThrow(
      'Could not reach the server. Try again.',
    )
  })
})

describe('request and response checks', () => {
  it('sends the new user as JSON', async () => {
    let type: string | null = null
    server.use(
      http.post('/v1/users', ({ request }) => {
        type = request.headers.get('Content-Type')
        return HttpResponse.json({ id: 'u1', ...input }, { status: 201 })
      }),
    )

    await createUser(input)

    expect(type).toBe('application/json')
  })

  it.each(['id', 'email', 'name', 'roles'])(
    'warns that the user may exist when the answer has no %s',
    async (missing) => {
      const full: Record<string, unknown> = { id: 'u1', ...input }
      delete full[missing]
      server.use(http.post('/v1/users', () => HttpResponse.json(full, { status: 201 })))

      await expect(createUser(input)).rejects.toThrow(
        'The user was added, but the answer could not be read.',
      )
    },
  )

  it('warns that the user may exist when the success answer is not JSON', async () => {
    server.use(http.post('/v1/users', () => new HttpResponse('oops', { status: 201 })))

    await expect(createUser(input)).rejects.toThrow(
      'The user was added, but the answer could not be read',
    )
  })

  it('uses the general message when the API message is empty', async () => {
    server.use(http.post('/v1/users', () => HttpResponse.json({ message: '' }, { status: 409 })))

    await expect(createUser(input)).rejects.toThrow('The user could not be added. Try again.')
  })

  it.each(['id', 'email', 'name', 'roles', 'disabled'])(
    'rejects a listed user with no %s',
    async (missing) => {
      const user: Record<string, unknown> = {
        id: 'a',
        email: 'a@example.com',
        name: 'A',
        roles: [],
        disabled: false,
      }
      delete user[missing]
      server.use(http.get('/v1/users', () => HttpResponse.json({ users: [user] })))

      await expect(fetchUsers()).rejects.toThrow('unexpected response')
    },
  )

  it('uses the general message when a reset failure has an empty message', async () => {
    server.use(
      http.post('/v1/users/:id/password-reset', () =>
        HttpResponse.json({ message: '' }, { status: 502 }),
      ),
    )

    await expect(sendPasswordReset('u1')).rejects.toThrow(
      'The reset link could not be sent. Try again.',
    )
  })
})

describe('setUserDisabled', () => {
  it.each([
    [true, 'disable'],
    [false, 'enable'],
  ])('posts to the %s path', async (disabled, action) => {
    let called = ''
    server.use(
      http.post('/v1/users/:id/:action', ({ params }) => {
        called = `${String(params['id'])}/${String(params['action'])}`
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await setUserDisabled('u 1', disabled)

    expect(called).toBe(`u 1/${action}`)
  })

  it.each([
    [401, 'You are signed out. Sign in again and retry.'],
    [403, 'Only an admin can change users.'],
    [404, 'That user no longer exists. Reload the list.'],
    [500, 'The user could not be disabled. Try again.'],
  ])('turns a %s into a message', async (status, message) => {
    server.use(http.post('/v1/users/:id/disable', () => new HttpResponse(null, { status })))

    await expect(setUserDisabled('u-1', true)).rejects.toThrow(message)
  })

  it('says "enabled" in the fallback when enabling', async () => {
    server.use(http.post('/v1/users/:id/enable', () => new HttpResponse(null, { status: 500 })))

    await expect(setUserDisabled('u-1', false)).rejects.toThrow(
      'The user could not be enabled. Try again.',
    )
  })

  it.each([400, 409, 503])('shows the API message for a %s', async (status) => {
    server.use(
      http.post('/v1/users/:id/disable', () =>
        HttpResponse.json({ message: 'Because.' }, { status }),
      ),
    )

    await expect(setUserDisabled('u-1', true)).rejects.toThrow('Because.')
  })

  it('keeps its own words for a 500, even when the body has a message', async () => {
    server.use(
      http.post('/v1/users/:id/disable', () =>
        HttpResponse.json({ message: 'Stack trace…' }, { status: 500 }),
      ),
    )

    await expect(setUserDisabled('u-1', true)).rejects.toThrow(
      'The user could not be disabled. Try again.',
    )
  })

  it.each([{ message: '' }, { message: 5 }, {}])(
    'falls back when a 409 carries %j',
    async (body) => {
      server.use(http.post('/v1/users/:id/disable', () => HttpResponse.json(body, { status: 409 })))

      await expect(setUserDisabled('u-1', true)).rejects.toThrow(
        'The user could not be disabled. Try again.',
      )
    },
  )

  it('falls back when a 409 has no readable message', async () => {
    server.use(http.post('/v1/users/:id/disable', () => new HttpResponse('oops', { status: 409 })))

    await expect(setUserDisabled('u-1', true)).rejects.toBeInstanceOf(EditUserError)
  })

  it('says so when the server cannot be reached', async () => {
    server.use(http.post('/v1/users/:id/disable', () => HttpResponse.error()))

    await expect(setUserDisabled('u-1', true)).rejects.toThrow(
      'Could not reach the server. Try again.',
    )
  })
})

describe('updateUserRoles', () => {
  it('sends the roles as JSON and returns the user', async () => {
    let sent: unknown
    let contentType: string | null = null
    server.use(
      http.patch('/v1/users/:id', async ({ request }) => {
        contentType = request.headers.get('content-type')
        sent = await request.json()
        return HttpResponse.json({
          id: 'u-dee',
          email: 'd@example.com',
          name: 'Dee',
          roles: ['admin'],
          disabled: false,
        })
      }),
    )

    const user = await updateUserRoles('u-dee', ['admin'])

    expect(sent).toEqual({ roles: ['admin'] })
    expect(contentType).toBe('application/json')
    expect(user.roles).toEqual(['admin'])
  })

  it('shows the API message for the last-admin refusal', async () => {
    await expect(updateUserRoles('u-ada', ['director'])).rejects.toThrow(
      'This would leave no enabled admin. Make another user an admin first.',
    )
  })

  it('uses its own fallback', async () => {
    server.use(http.patch('/v1/users/:id', () => new HttpResponse(null, { status: 500 })))

    await expect(updateUserRoles('u-dee', ['admin'])).rejects.toThrow(
      'The roles could not be saved. Try again.',
    )
  })

  it.each([
    ['not JSON', () => new HttpResponse('oops')],
    ['not a user', () => HttpResponse.json({ id: 1 })],
  ])('rejects an answer that is %s', async (_label, respond) => {
    server.use(http.patch('/v1/users/:id', respond))

    await expect(updateUserRoles('u-dee', ['admin'])).rejects.toThrow(/answer could not be read/)
  })
})
