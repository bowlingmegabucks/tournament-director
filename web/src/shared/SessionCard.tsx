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
  /** Anything below the facts. */
  children?: ReactNode
}

/**
 * A squad or sweeper as a card (D-44). The date is the title, as in legacy, followed by Open or
 * Complete. It links to the session's page (D-60).
 */
export function SessionCard({ session, href, facts, children }: Readonly<SessionCardProps>) {
  return (
    <li className={styles.card}>
      <h2 className={styles.title}>
        <Link to={href}>{formatSessionDate(session.date)}</Link>
        <span className={styles.status}>{session.complete ? 'Complete' : 'Open'}</span>
      </h2>
      <dl className={styles.facts}>
        <Fact label="Lanes">{formatLanes(session.startingLane, session.numberOfLanes)}</Fact>
        <Fact label="Per pair">{formatPerPair(session.maxPerPair)}</Fact>
        {facts}
      </dl>
      {children}
    </li>
  )
}
