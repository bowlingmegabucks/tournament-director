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
 * `inner` is spread, so it must be a plain object of functions, as both writers are.
 */
export function createPublishingRegistrationWriter(
  inner: RegistrationWriter,
  events: SessionEvents,
  logger: Logger,
): RegistrationWriter {
  /** The squads and sweepers the registration is in now, `[]` for an unknown or a new one. */
  async function currentSessions(registrationId: string): Promise<string[]> {
    try {
      return (await inner.getDetail(registrationId))?.sessionIds ?? []
    } catch (err) {
      logger.warn({ err, registrationId }, 'Could not read the sessions before a write')
      return []
    }
  }

  function tell(sessionIds: Iterable<string>): void {
    for (const sessionId of new Set(sessionIds)) {
      try {
        events.publish(sessionId, 'entries')
      } catch (err) {
        logger.warn({ err, sessionId }, 'Could not publish an entry change')
      }
    }
  }

  return {
    ...inner,

    async save(command) {
      const before = command.registration.isNew
        ? []
        : await currentSessions(command.registration.id)
      await inner.save(command)
      tell([...before, ...command.addSessionIds, ...(command.removeSessionIds ?? [])])
    },

    async deleteRegistration(registrationId) {
      const before = await currentSessions(registrationId)
      await inner.deleteRegistration(registrationId)
      tell(before)
    },

    async removeForDesk(registrationId, tournamentId, decide) {
      const before = await currentSessions(registrationId)
      const plan = await inner.removeForDesk(registrationId, tournamentId, decide)
      if (plan?.kind === 'delete') tell(before)
      return plan
    },
  }
}
