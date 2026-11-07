import { useId } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import dialog from '../../shared/Dialog.module.css'
import type { ExistingRegistration } from './types'

interface AlreadyRegisteredDialogProps {
  name: string
  existing: ExistingRegistration
  /** What the desk is about to add, as text. */
  adding: string[]
  pending: boolean
  failure: string | undefined
  onConfirm: () => void
  onClose: () => void
}

/**
 * The fallback when the server finds the bowler already registered after the desk picked them as
 * not (D-159, D-165): someone else registered them a moment ago. Go back comes first.
 */
export function AlreadyRegisteredDialog({
  name,
  existing,
  adding,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<AlreadyRegisteredDialogProps>) {
  const titleId = useId()
  return (
    <dialog ref={showOnMount} className={dialog.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={dialog.content}>
        <h2 id={titleId} className={dialog.title}>
          Already registered
        </h2>
        <p className={dialog.text}>
          {name} is already registered for this tournament in {existing.divisionName}. Add these to
          that registration?
        </p>
        <ul>
          {adding.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {failure && (
          <p role="alert" className={dialog.error}>
            {failure}
          </p>
        )}
        <div className={dialog.actions}>
          <button
            type="button"
            className={dialog.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            No, go back
          </button>
          <button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? 'Saving…' : 'Yes, add to registration'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

interface UsbcIdOnFileDialogProps {
  stored: { id: string; name: string }
  usbcId: string
  onUse: () => void
  onClose: () => void
}

/** A new bowler's USBC ID belongs to a stored bowler (D-161). Use that bowler, or change the ID. */
export function UsbcIdOnFileDialog({
  stored,
  usbcId,
  onUse,
  onClose,
}: Readonly<UsbcIdOnFileDialogProps>) {
  const titleId = useId()
  return (
    <dialog ref={showOnMount} className={dialog.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={dialog.content}>
        <h2 id={titleId} className={dialog.title}>
          A bowler with this USBC ID is on file
        </h2>
        <p className={dialog.text}>
          <strong>{stored.name}</strong>, {usbcId}.
        </p>
        <p className={dialog.text}>
          Use this bowler? What you typed becomes changes to that bowler&apos;s record.
        </p>
        <div className={dialog.actions}>
          <button type="button" className={dialog.secondary} onClick={closeDialogOf}>
            No, change the USBC ID
          </button>
          <button type="button" onClick={onUse}>
            Yes, use this bowler
          </button>
        </div>
      </div>
    </dialog>
  )
}
