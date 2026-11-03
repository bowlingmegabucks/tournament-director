import { useId, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { closeDialogOf, showOnMount } from './dialogParts'
import { RolePicker } from './RolePicker'
import type { ListedUser } from './types'
import { useUserOptions } from './useUsers'
import styles from './UserDialog.module.css'

interface EditRolesDialogProps {
  user: ListedUser
  saving: boolean
  /** The failure of the last save, shown in the dialog so the admin can retry. */
  error: string | undefined
  onSave: (roles: string[]) => void
  onClose: () => void
}

/** Change one user's roles (`users.manage`). The API enforces the rules; this only asks. */
export function EditRolesDialog({
  user,
  saving,
  error,
  onSave,
  onClose,
}: Readonly<EditRolesDialogProps>) {
  const titleId = useId()
  const options = useUserOptions()
  const [selected, setSelected] = useState<string[]>(user.roles)
  const [missing, setMissing] = useState(false)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected.length === 0) {
      setMissing(true)
      return
    }
    onSave(selected)
  }

  return (
    <dialog ref={showOnMount} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <form className={styles.content} onSubmit={submit}>
        <h2 id={titleId} className={styles.title}>
          Edit roles for {user.name}
        </h2>
        {options.isPending && <Loading label="Loading roles…" />}
        {options.error && (
          <QueryError
            error={options.error}
            onRetry={() => {
              void options.refetch()
            }}
          />
        )}
        {options.data && (
          <RolePicker
            idPrefix="edit-user"
            roles={options.data.roles}
            selected={selected}
            error={missing ? 'Pick at least one role.' : undefined}
            onToggle={(role, checked) => {
              setSelected((current) =>
                checked ? [...current, role] : current.filter((r) => r !== role),
              )
              setMissing(false)
            }}
          />
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeDialogOf}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !options.data}>
            {saving ? 'Saving…' : 'Save roles'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
