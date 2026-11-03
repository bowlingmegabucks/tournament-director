import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MailConfig } from '../../config.ts'

const sendMail = vi.fn()
const createTransport = vi.fn(() => ({ sendMail }))
vi.mock('nodemailer', () => ({ createTransport }))

const { createSmtpMailer } = await import('./mailer.ts')

const config: MailConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'bowling@example.com',
  password: 'mailbox-password',
  from: 'Tournament Director <bowling@example.com>',
  webBaseUrl: 'https://example.com',
}

beforeEach(() => {
  sendMail.mockReset()
  createTransport.mockClear()
})

describe('createSmtpMailer', () => {
  it('requires STARTTLS on the plain port and sets timeouts', () => {
    createSmtpMailer(config)

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'bowling@example.com', pass: 'mailbox-password' },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 15_000,
      }),
    )
  })

  it('does not ask for STARTTLS when TLS starts at once', () => {
    createSmtpMailer({ ...config, port: 465, secure: true })

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    )
  })

  it('sends from the configured address', async () => {
    sendMail.mockResolvedValue({})
    const message = { to: 'ada@example.com', subject: 'Hi', text: 'text', html: '<p>html</p>' }

    await createSmtpMailer(config).send(message)

    expect(sendMail).toHaveBeenCalledWith({ from: config.from, ...message })
  })

  it('passes a send failure on', async () => {
    sendMail.mockRejectedValue(new Error('connection refused'))

    await expect(
      createSmtpMailer(config).send({ to: 'a@b.co', subject: 's', text: 't', html: 'h' }),
    ).rejects.toThrow('connection refused')
  })
})
