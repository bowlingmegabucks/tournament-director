import { http, HttpResponse } from 'msw'
import { createSignedInUser } from './data'
import type { SignedInUser } from '../features/auth/types'

/** The seeded local users (D-104) and the role each holds. */
const accounts = [
  {
    email: 'admin@example.com',
    password: 'adminP4sswordLocal',
    name: 'Local Admin',
    role: 'admin',
  },
  {
    email: 'director@example.com',
    password: 'directorP4sswordLocal',
    name: 'Local Director',
    role: 'director',
  },
  {
    email: 'scorekeeper@example.com',
    password: 'scoreKeeperP4sswordLocal',
    name: 'Local Score Keeper',
    role: 'scoreKeeper',
  },
]

// Who is signed in, so a sign-in changes what /v1/me returns, as the real cookie does.
let current: SignedInUser | null = null

/** Sign in as this user without going through the form. Tests use it to start signed in. */
export function setMockUser(user: SignedInUser | null) {
  current = user
}

export const authHandlers = [
  http.get('/v1/me', () => HttpResponse.json({ apiKey: false, user: current })),
  http.post('/v1/auth/sign-in/email', async ({ request }) => {
    const body: unknown = await request.json()
    const email = typeof body === 'object' && body !== null ? Reflect.get(body, 'email') : undefined
    const password =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'password') : undefined
    const account = accounts.find(
      (candidate) => candidate.email === email && candidate.password === password,
    )
    if (!account) {
      return HttpResponse.json(
        { message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' },
        { status: 401 },
      )
    }
    const user = createSignedInUser({
      email: account.email,
      name: account.name,
      roles: [account.role],
    })
    current = user
    return HttpResponse.json({ redirect: false, user: { id: user.id, email: user.email } })
  }),
  http.post('/v1/auth/sign-out', () => {
    current = null
    return HttpResponse.json({ success: true })
  }),
]
