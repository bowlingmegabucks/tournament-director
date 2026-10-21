import type { ReactNode } from 'react'
import styles from './Page.module.css'

/** The `<main>` landmark for a page. The tournament layout supplies its own. */
export function Page({ children }: Readonly<{ children: ReactNode }>) {
  return <main className={styles.page}>{children}</main>
}
