import { resetLinkSeconds } from '../../shared/auth/createAuth.ts'
import type { Logger } from '../../shared/logger.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'

const hours = resetLinkSeconds / 3600

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
    `The link works for ${hours} hours. If you did not expect this email, ignore it.`,
  ].join('\n')
  const html = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>An admin added you to Tournament Director. Choose your password with this link:</p>',
    `<p><a href="${escapeHtml(link)}">Choose your password</a></p>`,
    `<p>The link works for ${hours} hours. If you did not expect this email, ignore it.</p>`,
  ].join('\n')
  return { subject: 'Your Tournament Director account', text, html }
}

/** The page the invite link opens. The token is a secret: it goes in the email and nowhere else. */
export function inviteLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl}/set-password?token=${encodeURIComponent(token)}`
}

export interface InviteMailer {
  /**
   * Hand this to Better Auth as `sendResetPassword`. It never throws: Better Auth would log the
   * error and carry on, so the outcome goes to `take` instead.
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
): InviteMailer {
  const outcomes = new Map<string, boolean>()
  return {
    deliver: async ({ user, token }) => {
      try {
        await mailer.send({
          to: user.email,
          ...buildInvite(user.name, inviteLink(webBaseUrl, token)),
        })
        outcomes.set(user.email, true)
      } catch (err) {
        // The cause may name the mail server or the mailbox. It stays in the log.
        logger.error({ err }, 'Invite email failed')
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
