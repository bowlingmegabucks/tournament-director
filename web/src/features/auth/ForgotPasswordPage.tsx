import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router'
import { Page } from '../../shared/Page'
import { useRequestPasswordReset } from './useMe'
import styles from './LoginPage.module.css'

/**
 * Ask for a link to choose a new password. The answer is the same for every address, so this page
 * never says whether the email has an account.
 */
export function ForgotPasswordPage() {
  const request = useRequestPasswordReset()
  const [email, setEmail] = useState('')

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    request.mutate(email.trim())
  }

  return (
    <Page>
      <title>Forgot password · Tournament Director</title>
      <h1>Forgot password</h1>
      {request.isSuccess ? (
        <>
          <p role="status">
            If that address has an account, we sent it a link to choose a new password. The link
            works for 72 hours.
          </p>
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <p>Enter your email and we will send you a link to choose a new password.</p>
          {request.error && (
            <p id="forgot-error" role="alert" className={styles.error}>
              {request.error.message}
            </p>
          )}
          <div className={styles.field}>
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              aria-describedby={request.error ? 'forgot-error' : undefined}
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
          <button type="submit" disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send link'}
          </button>
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      )}
    </Page>
  )
}
