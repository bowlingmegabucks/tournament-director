import type { SessionEvents } from '../../shared/events/sessionEvents.ts'
import type { Logger } from '../../shared/logger.ts'
import type { RegistrationWriter } from './writer.ts'

/**
 * Wraps a registration writer so each write tells every open screen of the squads and sweepers it
 * touches (LAN-22, D-219): the desk's create, edit, and delete, and the registration site's calls
 * (they go through the same writer, so no vendor route changes: D-09). A new entry then lands in
 * "unassigned" on every open lane page. The ids are read before the write (a delete removes the
 * sessions with the registration) and the messages go after it commits, only on success. A
 * failure to read or to publish is logged and never fails the write.
 *
 * A save that clears an average check (a new average or division, AVG-08, D-290) also sends
 * `averages` to those sessions and calls `averagesCleared` with the tournament, so the screens
 * refetch handicap and the marker (AVG-19, D-298). A delete needs no such message: the entry
 * change already says the bowler is gone.
 *
 * `inner` is spread, so it must be a plain object of functions, as both writers are.
 */
export function createPublishingRegistrationWriter(
  inner: RegistrationWriter,
  events: SessionEvents,
  logger: Logger,
  averagesCleared: (tournamentId: string) => void = () => undefined,
): RegistrationWriter {
  /** The tournament and the squads and sweepers the registration is in now; empty for an unknown or a new one. */
  async function current(
    registrationId: string,
  ): Promise<{ tournamentId: string | undefined; sessionIds: string[] }> {
    try {
      const detail = await inner.getDetail(registrationId)
      return { tournamentId: detail?.tournamentId, sessionIds: detail?.sessionIds ?? [] }
    } catch (err) {
      logger.warn({ err, registrationId }, 'Could not read the sessions before a write')
      return { tournamentId: undefined, sessionIds: [] }
    }
  }

  function tell(sessionIds: Iterable<string>, kind: 'entries' | 'averages' = 'entries'): void {
    for (const sessionId of new Set(sessionIds)) {
      try {
        events.publish(sessionId, kind)
      } catch (err) {
        logger.warn(
          { err, sessionId },
          kind === 'entries'
            ? 'Could not publish an entry change'
            : 'Could not publish an average change',
        )
      }
    }
  }

  function tellAverages(tournamentId: string | undefined, sessionIds: Iterable<string>): void {
    tell(sessionIds, 'averages')
    if (tournamentId === undefined) return
    try {
      averagesCleared(tournamentId)
    } catch (err) {
      logger.warn({ err, tournamentId }, 'Could not publish an average change')
    }
  }

  return {
    ...inner,

    async save(command) {
      const before = command.registration.isNew
        ? { tournamentId: undefined, sessionIds: [] }
        : await current(command.registration.id)
      await inner.save(command)
      const touched = [
        ...before.sessionIds,
        ...command.addSessionIds,
        ...(command.removeSessionIds ?? []),
      ]
      tell(touched)
      if (command.registration.clearAverageCheck) tellAverages(before.tournamentId, touched)
    },

    async deleteRegistration(registrationId) {
      const before = await current(registrationId)
      await inner.deleteRegistration(registrationId)
      tell(before.sessionIds)
    },

    async removeForDesk(registrationId, tournamentId, decide) {
      const before = await current(registrationId)
      const plan = await inner.removeForDesk(registrationId, tournamentId, decide)
      if (plan?.kind === 'delete') tell(before.sessionIds)
      return plan
    },
  }
}
