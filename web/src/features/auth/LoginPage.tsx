import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { Page } from '../../shared/Page'
import { QuickLogin } from './QuickLogin'
import { useMe, useSignIn } from './useMe'
import styles from './LoginPage.module.css'

/** Where to go after sign-in: the page the user came from (set by `RequirePermission`), else Home. */
function returnPath(state: unknown): string {
  const from = field(state, 'from')
  const pathname = field(from, 'pathname')
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('\\')
  ) {
    return '/'
  }
  const search = field(from, 'search')
  const hash = field(from, 'hash')
  return `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`
}

/** The sign-in page. A user who is already signed in, or who just signed in, moves on. */
export function LoginPage() {
  const location = useLocation()
  const me = useMe()
  const signIn = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const formError = signIn.error?.message ?? (me.error ? me.error.message : undefined)

  if (me.data?.user) return <Navigate to={returnPath(location.state)} replace />

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate({ email, password })
  }

  return (
    <Page>
      <title>Sign in · Tournament Director</title>
      <h1>Sign in</h1>
      {me.isPending && <Loading label="Checking sign-in…" />}
      <form className={styles.form} onSubmit={submit}>
        {formError && (
          <p id="login-error" role="alert" className={styles.error}>
            {formError}
          </p>
        )}
        <div className={styles.field}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            aria-describedby={formError ? 'login-error' : undefined}
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            aria-describedby={formError ? 'login-error' : undefined}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
        </div>
        <button type="submit" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {import.meta.env.DEV && (
          <QuickLogin
            disabled={signIn.isPending}
            onPick={(pickedEmail, pickedPassword) => {
              signIn.mutate({ email: pickedEmail, password: pickedPassword })
            }}
          />
        )}
      </form>
    </Page>
  )
}
