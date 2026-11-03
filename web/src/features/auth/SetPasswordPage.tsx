import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Page } from '../../shared/Page'
import { useSetPassword } from './useMe'
import styles from './LoginPage.module.css'

/** The API's rule (`minPasswordLength`, `maxPasswordLength`). It still checks; this saves a trip. */
const MIN_LENGTH = 12
const MAX_LENGTH = 128

/**
 * Where the invite email leads (`/set-password?token=…`, D-101). The new user chooses a password
 * and then signs in. The token works once and lasts 3 days.
 */
export function SetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const passwordRequest = useSetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)

  const error = mismatch ? 'The two passwords do not match.' : passwordRequest.error?.message

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    passwordRequest.mutate({ token, newPassword: password })
  }

  return (
    <Page>
      <title>Choose your password · Tournament Director</title>
      <h1>Choose your password</h1>
      {token === '' && (
        <p role="alert" className={styles.error}>
          This link is not valid. Ask an admin for a new one.
        </p>
      )}
      {token !== '' && passwordRequest.isSuccess && (
        <>
          <output>Your password is set.</output>
          <p>
            <Link to="/login">Go to sign in</Link>
          </p>
        </>
      )}
      {token !== '' && !passwordRequest.isSuccess && (
        <form className={styles.form} onSubmit={submit}>
          <p>Use {MIN_LENGTH} or more characters.</p>
          {error && (
            <p id="set-password-error" role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.field}>
            <label htmlFor="set-password-new">New password</label>
            <input
              id="set-password-new"
              aria-describedby={error ? 'set-password-error' : undefined}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              maxLength={MAX_LENGTH}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setMismatch(false)
              }}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="set-password-confirm">Confirm password</label>
            <input
              id="set-password-confirm"
              aria-describedby={error ? 'set-password-error' : undefined}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              maxLength={MAX_LENGTH}
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value)
                setMismatch(false)
              }}
            />
          </div>
          <button type="submit" disabled={passwordRequest.isPending}>
            {passwordRequest.isPending ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}
    </Page>
  )
}
