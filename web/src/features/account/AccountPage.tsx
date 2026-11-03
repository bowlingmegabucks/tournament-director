import { useState } from 'react'
import { Page } from '../../shared/Page'
import { Toast } from '../../shared/Toast'
import { PasswordSection } from './PasswordSection'
import { ProfileSection } from './ProfileSection'
import type { Notice } from './notice'
import styles from './AccountPage.module.css'

const TOAST_MS = 8000

/**
 * Where a signed-in user edits their own name and changes their own password. `App.tsx` wraps it
 * in `RequirePermission` with no permission: any signed-in user may open it.
 */
export function AccountPage() {
  const [notice, setNotice] = useState<Notice>()
  return (
    <Page>
      <title>My account · Tournament Director</title>
      <h1>My account</h1>
      <div className={styles.sections}>
        <ProfileSection onNotice={setNotice} />
        <PasswordSection onNotice={setNotice} />
      </div>
      {notice && (
        <Toast
          kind={notice.kind}
          autoDismissMs={notice.kind === 'success' ? TOAST_MS : undefined}
          onDismiss={() => {
            setNotice(undefined)
          }}
        >
          {notice.text}
        </Toast>
      )}
    </Page>
  )
}
