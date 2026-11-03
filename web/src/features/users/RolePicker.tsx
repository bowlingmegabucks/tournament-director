import { roleLabel } from './roleLabels'
import styles from './RolePicker.module.css'

interface RolePickerProps {
  /** Prefix for the element ids, so two pickers never share one. */
  idPrefix: string
  roles: readonly string[]
  selected: readonly string[]
  onToggle: (role: string, checked: boolean) => void
  /** Shown under the boxes, and tied to the group for screen readers. */
  error?: string
}

/** The Roles checkboxes: the add-user page and the edit-roles dialog share them. */
export function RolePicker({
  idPrefix,
  roles,
  selected,
  onToggle,
  error,
}: Readonly<RolePickerProps>) {
  const errorId = `${idPrefix}-roles-error`
  return (
    <fieldset className={styles.roles} aria-describedby={error ? errorId : undefined}>
      <legend>Roles</legend>
      {roles.map((role) => {
        const { label, hint } = roleLabel(role)
        const id = `${idPrefix}-role-${role}`
        return (
          <div key={role} className={styles.role}>
            <input
              id={id}
              type="checkbox"
              checked={selected.includes(role)}
              aria-describedby={hint ? `${id}-hint` : undefined}
              onChange={(event) => {
                onToggle(role, event.target.checked)
              }}
            />
            <label htmlFor={id}>{label}</label>
            {hint && (
              <span id={`${id}-hint`} className={styles.hint}>
                {hint}
              </span>
            )}
          </div>
        )
      })}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
