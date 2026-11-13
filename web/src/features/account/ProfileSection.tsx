import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { LeaveDialog } from '../../shared/LeaveDialog'
import { useLeaveGuard } from '../../shared/useLeaveGuard'
import { useMe } from '../auth/useMe'
import type { Notice } from './notice'
import { useUpdateName } from './useAccount'
import styles from './AccountPage.module.css'

const NAME_MAX_LENGTH = 100

/** The signed-in user edits their own name. The email is shown, not editable. */
export function ProfileSection({ onNotice }: Readonly<{ onNotice: (notice: Notice) => void }>) {
  const { data } = useMe()
  const save = useUpdateName()
  // Stryker disable next-line StringLiteral: `RequirePermission` only renders this page for a signed-in user.
  const current = data?.user?.name ?? ''
  // `undefined` until the user types, so the field shows the saved name and follows a refetch.
  const [draft, setDraft] = useState<string>()
  const name = draft ?? current
  // Leaving with the name changed and not saved asks first.
  const guard = useLeaveGuard(name !== current)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    // `required` accepts spaces, so check here.
    if (name.trim() === '') {
      onNotice({ kind: 'error', text: 'Enter a name.' })
      return
    }
    save.mutate(name.trim(), {
      onSuccess: (saved) => {
        setDraft(undefined)
        onNotice({ kind: 'success', text: `Name saved as ${saved}.` })
      },
      onError: (error) => {
        onNotice({ kind: 'error', text: error.message })
      },
    })
  }

  return (
    <section className={styles.section} aria-labelledby="account-profile">
      <h2 id="account-profile">Profile</h2>
      <p className={styles.note}>Your email is {data?.user?.email}. An admin changes it.</p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="account-name">Name</label>
          <input
            id="account-name"
            name="name"
            autoComplete="name"
            required
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
          />
        </div>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save name'}
        </button>
      </form>
      <LeaveDialog blocker={guard.blocker} />
    </section>
  )
}
