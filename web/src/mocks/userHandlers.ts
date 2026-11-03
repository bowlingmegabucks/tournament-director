import { http, HttpResponse } from 'msw'

/** The roles the mock API offers: the same names as `roles.ts` in `api/`. */
const roles = ['scoreKeeper', 'director', 'admin']

/** An email the mock API treats as already taken. */
export const takenEmail = 'taken@example.com'

/** The users the mock API lists. */
export const mockUsers = [
  {
    id: 'u-ada',
    email: 'admin@example.com',
    name: 'Local Admin',
    roles: ['admin'],
    disabled: false,
  },
  {
    id: 'u-dee',
    email: 'director@example.com',
    name: 'Local Director',
    roles: ['director', 'scoreKeeper'],
    disabled: false,
  },
  { id: 'u-old', email: 'old@example.com', name: 'Old Timer', roles: [], disabled: true },
]

/** Ids the mock API refuses to change, to show an error: the last admin. */
export const lastAdminId = 'u-ada'

export const userHandlers = [
  http.post('/v1/users/:id/disable', ({ params }) =>
    params['id'] === lastAdminId
      ? HttpResponse.json({ message: 'You cannot disable your own account.' }, { status: 409 })
      : new HttpResponse(null, { status: 204 }),
  ),
  http.post('/v1/users/:id/enable', () => new HttpResponse(null, { status: 204 })),
  http.patch('/v1/users/:id', async ({ params, request }) => {
    const user = mockUsers.find((candidate) => candidate.id === params['id'])
    if (!user) return HttpResponse.json({ message: 'User not found.' }, { status: 404 })
    const body: unknown = await request.json()
    const roles = typeof body === 'object' && body !== null ? Reflect.get(body, 'roles') : undefined
    if (!Array.isArray(roles) || roles.length === 0) {
      return HttpResponse.json({ message: 'pick at least one role' }, { status: 400 })
    }
    if (user.id === lastAdminId && !roles.includes('admin')) {
      return HttpResponse.json(
        { message: 'This would leave no enabled admin. Make another user an admin first.' },
        { status: 409 },
      )
    }
    return HttpResponse.json({ ...user, roles })
  }),
  http.get('/v1/users', () => HttpResponse.json({ users: mockUsers })),
  http.post('/v1/users/:id/password-reset', ({ params }) =>
    mockUsers.some((user) => user.id === params.id)
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ message: 'User not found.' }, { status: 404 }),
  ),
  http.get('/v1/users/options', () => HttpResponse.json({ roles, inviteEmail: true })),
  http.post('/v1/users', async ({ request }) => {
    const body: unknown = await request.json()
    const email = typeof body === 'object' && body !== null ? Reflect.get(body, 'email') : undefined
    const name = typeof body === 'object' && body !== null ? Reflect.get(body, 'name') : undefined
    const given = typeof body === 'object' && body !== null ? Reflect.get(body, 'roles') : undefined
    if (typeof email !== 'string' || typeof name !== 'string' || !Array.isArray(given)) {
      return HttpResponse.json({ message: 'Invalid request.' }, { status: 400 })
    }
    if (email.toLowerCase() === takenEmail) {
      return HttpResponse.json(
        { message: 'A user with this email already exists.' },
        { status: 409 },
      )
    }
    return HttpResponse.json(
      { id: crypto.randomUUID(), email: email.toLowerCase(), name, roles: given },
      { status: 201 },
    )
  }),
]
