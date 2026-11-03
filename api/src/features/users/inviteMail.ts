import { inviteLinkSeconds, resetLinkSeconds } from '../../shared/auth/createAuth.ts'
import type { Logger } from '../../shared/logger.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'

/** "72 hours", or "1 hour". */
function lifetime(seconds: number): string {
  const hours = seconds / 3600
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** The invite message for a new user. The link opens the set-password page in the web app. */
export function buildInvite(name: string, link: string) {
  const text = [
    `Hi ${name},`,
    '',
    'An admin added you to Tournament Director. Choose your password with this link:',
    link,
    '',
    `The link works for ${lifetime(inviteLinkSeconds)}. If you did not expect this email, ignore it.`,
  ].join('\n')
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>An admin added you to Tournament Director. Choose your password with this link:</p>',
    `<p><a href="${escapeHtml(link)}">Choose your password</a></p>`,
    `<p>The link works for ${lifetime(inviteLinkSeconds)}. If you did not expect this email, ignore it.</p>`,
  ].join('\n')
  return { subject: 'Your Tournament Director account', text, html }
}

/** The message for someone who forgot their password. The link opens the same page as an invite. */
export function buildPasswordReset(name: string, link: string) {
  const text = [
    `Hi ${name},`,
    '',
    'Someone asked to reset your Tournament Director password. Choose a new one with this link:',
    link,
    '',
    `The link works for ${lifetime(resetLinkSeconds)}. If you did not ask for this, ignore it: your password stays as it is.`,
  ].join('\n')
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>Someone asked to reset your Tournament Director password. Choose a new one with this link:</p>',
    `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>`,
    `<p>The link works for ${lifetime(resetLinkSeconds)}. If you did not ask for this, ignore it: your password stays as it is.</p>`,
  ].join('\n')
  return { subject: 'Reset your Tournament Director password', text, html }
}

/** The message when an admin starts a reset for a user. The link opens the same page. */
export function buildAdminReset(name: string, link: string) {
  const text = [
    `Hi ${name},`,
    '',
    'An admin started a password reset for your Tournament Director account. Choose a new password with this link:',
    link,
    '',
    `The link works for ${lifetime(resetLinkSeconds)}. Your password stays as it is until you use it.`,
  ].join('\n')
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>An admin started a password reset for your Tournament Director account. Choose a new password with this link:</p>',
    `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>`,
    `<p>The link works for ${lifetime(resetLinkSeconds)}. Your password stays as it is until you use it.</p>`,
  ].join('\n')
  return { subject: 'Reset your Tournament Director password', text, html }
}

/** The page the invite link opens. The token is a secret: it goes in the email and nowhere else. */
export function inviteLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl}/set-password?token=${encodeURIComponent(token)}`
}

export interface InviteMailer {
  /**
   * Say that the next token for this email is an invite (an admin just added the user). `deliver`
   * then sends the invite wording and waits for the mail, so `take` can report it. Any other token
   * is a forgotten-password request.
   */
  expectInvite: (email: string) => void
  /**
   * Say that the next token for this email is a reset an admin started. Like an invite, `deliver`
   * waits for the mail and `take` reports it: an admin is signed in, so there is no one to hide
   * the outcome from.
   */
  expectAdminReset: (email: string) => void
  /**
   * Hand this to Better Auth as `sendResetPassword`. It never throws: Better Auth would log the
   * error and carry on, so an invite's outcome goes to `take` instead. A forgotten-password mail
   * is sent in the background and `deliver` returns at once, so the call takes as long for an
   * address with an account as for one without, and the answer never shows which has one.
   */
  deliver: (data: { user: { email: string; name: string }; token: string }) => Promise<void>
  /** Whether the last delivery to this email worked. `undefined` when none ran. Read once. */
  take: (email: string) => boolean | undefined
}

/** Mail an invite for each reset token Better Auth makes, and remember whether it went out. */
export function createInviteMailer(
  mailer: Mailer,
  webBaseUrl: string,
  logger: Logger,
  /** Gives an invite token its longer life. Without it an invite works for `resetLinkSeconds`. */
  extendInvite?: (token: string) => Promise<void>,
): InviteMailer {
  const outcomes = new Map<string, boolean>()
  const expected = new Map<string, 'invite' | 'adminReset'>()
  return {
    expectInvite: (email) => {
      expected.set(email, 'invite')
    },
    expectAdminReset: (email) => {
      expected.set(email, 'adminReset')
    },
    deliver: async ({ user, token }) => {
      const link = inviteLink(webBaseUrl, token)
      const kind = expected.get(user.email)
      expected.delete(user.email)
      if (kind === undefined) {
        mailer
          .send({ to: user.email, ...buildPasswordReset(user.name, link) })
          .catch((err: unknown) => {
            logger.error({ err }, 'Password reset email failed')
          })
        return
      }
      try {
        if (kind === 'invite') await extendInvite?.(token)
        await mailer.send({
          to: user.email,
          ...(kind === 'invite' ? buildInvite(user.name, link) : buildAdminReset(user.name, link)),
        })
        outcomes.set(user.email, true)
      } catch (err) {
        // The cause may name the mail server or the mailbox. It stays in the log.
        logger.error(
          { err },
          kind === 'invite' ? 'Invite email failed' : 'Admin reset email failed',
        )
        outcomes.set(user.email, false)
      }
    },
    take: (email) => {
      const outcome = outcomes.get(email)
      outcomes.delete(email)
      return outcome
    },
  }
}
