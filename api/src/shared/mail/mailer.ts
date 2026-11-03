import { createTransport } from 'nodemailer'
import type { MailConfig } from '../../config.ts'

export interface MailMessage {
  to: string
  subject: string
  /** Plain text. Every message has it, for clients that show no HTML. */
  text: string
  html: string
}

/** Sends one email. Rejects when the mail server refuses or cannot be reached. */
export interface Mailer {
  send: (message: MailMessage) => Promise<void>
}

// A mail server that does not answer must not hold an admin's request for the 2-minute default.
const timeoutMs = 15_000

/**
 * Send through the SMTP mailbox in `MailConfig`. STARTTLS is required on the plain port: a server
 * that cannot upgrade fails the send, and the password never crosses the network in the clear.
 * Only `server.ts` builds it; tests pass a fake `Mailer`.
 */
export function createSmtpMailer(config: MailConfig): Mailer {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    // The local Mailpit container signs its own certificate. Config refuses this in production.
    tls: { rejectUnauthorized: !config.allowSelfSigned },
    auth: { user: config.user, pass: config.password },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  })
  return {
    send: async (message) => {
      await transport.sendMail({ from: config.from, ...message })
    },
  }
}
