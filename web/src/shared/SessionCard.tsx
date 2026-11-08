import type { ReactNode } from 'react'
import { Link } from 'react-router'
import styles from './SessionCard.module.css'
import { formatLanes, formatPerPair, formatSessionDate } from './sessionFormat'

/** The fields a squad and a sweeper share on their cards. */
interface Session {
  date: string
  complete: boolean
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
}

/** A list of session cards. The caller gives each card a stable `key` (the session id). */
export function SessionList({ children }: Readonly<{ children: ReactNode }>) {
  return <ul className={styles.list}>{children}</ul>
}

/** One labelled fact on a card. */
export function Fact({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  )
}

interface SessionCardProps {
  session: Session
  /** Where the date links to: the squad or sweeper page (D-60), relative to the list's route. */
  href: string
  /** The facts that differ between squads and sweepers. */
  facts: ReactNode
  /** Beside the title, such as the Edit link and Delete button (D-185, D-188). */
  action?: ReactNode
  /** Anything below the facts. */
  children?: ReactNode
}

/**
 * The "Edit" link of a card (D-185). The page decides when to show it: the user needs
 * `squads.write` and the session and tournament must be open. The name carries the date so a
 * screen reader can tell the links apart.
 */
export function EditSessionLink({ to, label }: Readonly<{ to: string; label: string }>) {
  return (
    <Link className={styles.editLink} to={to} aria-label={label}>
      Edit
    </Link>
  )
}

/**
 * A squad or sweeper as a card (D-44). The date is the title, as in legacy, followed by Open or
 * Complete. It links to the session's page (D-60).
 */
export function SessionCard({
  session,
  href,
  facts,
  action,
  children,
}: Readonly<SessionCardProps>) {
  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Link to={href}>{formatSessionDate(session.date)}</Link>
          <span className={styles.status}>{session.complete ? 'Complete' : 'Open'}</span>
        </h2>
        {action && <div className={styles.actions}>{action}</div>}
      </div>
      <dl className={styles.facts}>
        <Fact label="Lanes">{formatLanes(session.startingLane, session.numberOfLanes)}</Fact>
        <Fact label="Per pair">{formatPerPair(session.maxPerPair)}</Fact>
        {facts}
      </dl>
      {children}
    </li>
  )
}
