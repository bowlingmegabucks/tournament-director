import { useState } from 'react'
import type { SubmitEvent } from 'react'
import type { Notice } from './notice'
import { useChangePassword } from './useAccount'
import styles from './AccountPage.module.css'

/** The API's rule (`minPasswordLength`, `maxPasswordLength`). It still checks; this saves a trip. */
const MIN_LENGTH = 12
const MAX_LENGTH = 128

/** The signed-in user changes their own password. Other sessions end; this one stays. */
export function PasswordSection({ onNotice }: Readonly<{ onNotice: (notice: Notice) => void }>) {
  const change = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)

  const error = mismatch ? 'The two new passwords do not match.' : change.error?.message

  // Any edit starts over: the old reason no longer describes what is in the fields.
  function edited() {
    setMismatch(false)
    change.reset()
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setNewPassword('')
          setConfirm('')
          onNotice({
            kind: 'success',
            text: 'Password changed. Your other sessions are signed out.',
          })
        },
      },
    )
  }

  return (
    <section className={styles.section} aria-labelledby="account-password">
      <h2 id="account-password">Change password</h2>
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.note}>
          Use {MIN_LENGTH} or more characters. Changing it signs you out everywhere else.
        </p>
        {error && (
          <p id="account-password-error" role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <PasswordField
          id="account-current"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={(value) => {
            setCurrentPassword(value)
            edited()
          }}
        />
        <PasswordField
          id="account-new"
          label="New password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={newPassword}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={(value) => {
            setNewPassword(value)
            edited()
          }}
        />
        <PasswordField
          id="account-confirm"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={confirm}
          describedBy={error ? 'account-password-error' : undefined}
          onChange={(value) => {
            setConfirm(value)
            edited()
          }}
        />
        <button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  )
}

interface PasswordFieldProps {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  minLength?: number
  describedBy: string | undefined
  onChange: (value: string) => void
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  minLength,
  describedBy,
  onChange,
}: Readonly<PasswordFieldProps>) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={MAX_LENGTH}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}
