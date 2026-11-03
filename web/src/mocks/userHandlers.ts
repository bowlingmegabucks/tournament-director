import { http, HttpResponse } from 'msw'

/** The roles the mock API offers: the same names as `roles.ts` in `api/`. */
const roles = ['scoreKeeper', 'director', 'admin']

/** An email the mock API treats as already taken. */
export const takenEmail = 'taken@example.com'

export const userHandlers = [
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
