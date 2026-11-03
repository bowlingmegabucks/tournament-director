import { describe, expect, it, vi } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'
import {
  buildAdminReset,
  buildInvite,
  buildPasswordReset,
  createInviteMailer,
  inviteLink,
} from './inviteMail.ts'

const webBaseUrl = 'https://example.com/tournament-director'

describe('inviteLink', () => {
  it('opens the set-password page with the token encoded', () => {
    expect(inviteLink(webBaseUrl, 'a b&c')).toBe(
      'https://example.com/tournament-director/set-password?token=a%20b%26c',
    )
  })
})

describe('buildInvite', () => {
  it('puts the link in the text and the HTML, and says how long it works', () => {
    const invite = buildInvite('Ada', 'https://example.com/x?token=t')

    expect(invite.subject).toBe('Your Tournament Director account')
    expect(invite.text).toContain('Hi Ada,')
    expect(invite.text).toContain('https://example.com/x?token=t')
    expect(invite.text).toContain('72 hours')
    expect(invite.html).toContain('<a href="https://example.com/x?token=t">')
  })

  it('escapes a name and link in the HTML', () => {
    const invite = buildInvite('<b>"Ada"</b> & co', 'https://example.com/?a=1&b="2"')

    expect(invite.html).not.toContain('<b>')
    expect(invite.html).toContain('&lt;b&gt;&quot;Ada&quot;&lt;/b&gt; &amp; co')
    expect(invite.html).toContain('a=1&amp;b=&quot;2&quot;')
  })
})

describe('buildPasswordReset', () => {
  it('says someone asked for a reset, with the link and the lifetime', () => {
    const message = buildPasswordReset('Ada', 'https://example.com/x?token=t')

    expect(message.subject).toBe('Reset your Tournament Director password')
    expect(message.text).toContain('asked to reset your Tournament Director password')
    expect(message.text).toContain('https://example.com/x?token=t')
    expect(message.text).toContain('72 hours')
    expect(message.html).toContain('<a href="https://example.com/x?token=t">')
  })

  it('escapes the name in the HTML', () => {
    expect(buildPasswordReset('<i>Ada</i>', 'https://example.com/').html).toContain(
      '&lt;i&gt;Ada&lt;/i&gt;',
    )
  })
})

describe('buildAdminReset', () => {
  it('says an admin started the reset, with the link and the lifetime', () => {
    const message = buildAdminReset('Ada', 'https://example.com/x?token=t')

    expect(message.subject).toBe('Reset your Tournament Director password')
    expect(message.text).toContain('An admin started a password reset')
    expect(message.text).toContain('https://example.com/x?token=t')
    expect(message.text).toContain('72 hours')
    expect(message.html).toContain('<a href="https://example.com/x?token=t">')
  })

  it('escapes the name in the HTML', () => {
    expect(buildAdminReset('<i>Ada</i>', 'https://example.com/').html).toContain(
      '&lt;i&gt;Ada&lt;/i&gt;',
    )
  })
})

describe('buildInvite wording', () => {
  it('writes this exact message', () => {
    const message = buildInvite('Ada & Co', 'https://example.com/x?token=t&a=1')

    expect(message.subject).toBe('Your Tournament Director account')
    expect(message.text).toBe(
      [
        'Hi Ada & Co,',
        '',
        'An admin added you to Tournament Director. Choose your password with this link:',
        'https://example.com/x?token=t&a=1',
        '',
        'The link works for 72 hours. If you did not expect this email, ignore it.',
      ].join('\n'),
    )
    expect(message.html).toBe(
      [
        '<p>Hi Ada &amp; Co,</p>',
        '<p>An admin added you to Tournament Director. Choose your password with this link:</p>',
        '<p><a href="https://example.com/x?token=t&amp;a=1">Choose your password</a></p>',
        '<p>The link works for 72 hours. If you did not expect this email, ignore it.</p>',
      ].join('\n'),
    )
  })
})

describe('buildPasswordReset wording', () => {
  it('writes this exact message', () => {
    const message = buildPasswordReset('Ada & Co', 'https://example.com/x?token=t&a=1')

    expect(message.subject).toBe('Reset your Tournament Director password')
    expect(message.text).toBe(
      [
        'Hi Ada & Co,',
        '',
        'Someone asked to reset your Tournament Director password. Choose a new one with this link:',
        'https://example.com/x?token=t&a=1',
        '',
        'The link works for 72 hours. If you did not ask for this, ignore it: your password stays as it is.',
      ].join('\n'),
    )
    expect(message.html).toBe(
      [
        '<p>Hi Ada &amp; Co,</p>',
        '<p>Someone asked to reset your Tournament Director password. Choose a new one with this link:</p>',
        '<p><a href="https://example.com/x?token=t&amp;a=1">Choose a new password</a></p>',
        '<p>The link works for 72 hours. If you did not ask for this, ignore it: your password stays as it is.</p>',
      ].join('\n'),
    )
  })
})

describe('buildAdminReset wording', () => {
  it('writes this exact message', () => {
    const message = buildAdminReset('Ada & Co', 'https://example.com/x?token=t&a=1')

    expect(message.subject).toBe('Reset your Tournament Director password')
    expect(message.text).toBe(
      [
        'Hi Ada & Co,',
        '',
        'An admin started a password reset for your Tournament Director account. Choose a new password with this link:',
        'https://example.com/x?token=t&a=1',
        '',
        'The link works for 72 hours. Your password stays as it is until you use it.',
      ].join('\n'),
    )
    expect(message.html).toBe(
      [
        '<p>Hi Ada &amp; Co,</p>',
        '<p>An admin started a password reset for your Tournament Director account. Choose a new password with this link:</p>',
        '<p><a href="https://example.com/x?token=t&amp;a=1">Choose a new password</a></p>',
        '<p>The link works for 72 hours. Your password stays as it is until you use it.</p>',
      ].join('\n'),
    )
  })
})

describe('createInviteMailer', () => {
  const user = { email: 'ada@example.com', name: 'Ada' }

  it('sends the invite and records that it went out, once', async () => {
    const send = vi.fn<Mailer['send']>().mockResolvedValue(undefined)
    const invites = createInviteMailer({ send }, webBaseUrl, createCapturedLogger().logger)

    invites.expectInvite(user.email)
    await invites.deliver({ user, token: 'tok' })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        text: expect.stringContaining(`${webBaseUrl}/set-password?token=tok`) as string,
      }),
    )
    expect(invites.take(user.email)).toBe(true)
    expect(invites.take(user.email)).toBeUndefined()
  })

  it('records a failure, logs it without the link, and does not throw', async () => {
    const { logger, records } = createCapturedLogger()
    const send = vi.fn<Mailer['send']>().mockRejectedValue(new Error('535 bad login'))
    const invites = createInviteMailer({ send }, webBaseUrl, logger)

    invites.expectInvite(user.email)
    await expect(invites.deliver({ user, token: 'secret-token' })).resolves.toBeUndefined()

    expect(invites.take(user.email)).toBe(false)
    const logged = JSON.stringify(records())
    expect(logged).toContain('Invite email failed')
    expect(logged).toContain('535 bad login')
    expect(logged).not.toContain('secret-token')
  })

  it('knows nothing about an email it never sent to', () => {
    const invites = createInviteMailer({ send: vi.fn() }, webBaseUrl, createCapturedLogger().logger)

    expect(invites.take('nobody@example.com')).toBeUndefined()
  })

  it('sends a reset, not an invite, when no invite was expected, and does not wait for it', async () => {
    const send = vi.fn<Mailer['send']>().mockReturnValue(new Promise(() => undefined))
    const invites = createInviteMailer({ send }, webBaseUrl, createCapturedLogger().logger)

    await invites.deliver({ user, token: 'tok' })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Reset your Tournament Director password' }),
    )
    expect(invites.take(user.email)).toBeUndefined()
  })

  it('logs a failed reset mail and keeps quiet to the caller', async () => {
    const { logger, records } = createCapturedLogger()
    const send = vi.fn<Mailer['send']>().mockRejectedValue(new Error('535 bad login'))
    const invites = createInviteMailer({ send }, webBaseUrl, logger)

    await invites.deliver({ user, token: 'secret-token' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    const logged = JSON.stringify(records())
    expect(logged).toContain('Password reset email failed')
    expect(logged).toContain('535 bad login')
    expect(logged).not.toContain('secret-token')
    expect(invites.take(user.email)).toBeUndefined()
  })

  it('treats only the next token after expectInvite as an invite', async () => {
    const send = vi.fn<Mailer['send']>().mockResolvedValue(undefined)
    const invites = createInviteMailer({ send }, webBaseUrl, createCapturedLogger().logger)

    invites.expectInvite(user.email)
    await invites.deliver({ user, token: 'one' })
    await invites.deliver({ user, token: 'two' })

    expect(send.mock.calls.map(([message]) => message.subject)).toEqual([
      'Your Tournament Director account',
      'Reset your Tournament Director password',
    ])
  })

  it('waits for an admin-started reset, reports it, and logs a failure', async () => {
    const { logger, records } = createCapturedLogger()
    const send = vi
      .fn<Mailer['send']>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('535 bad login'))
    const invites = createInviteMailer({ send }, webBaseUrl, logger)

    invites.expectAdminReset(user.email)
    await invites.deliver({ user, token: 'one' })
    const sent = invites.take(user.email)
    invites.expectAdminReset(user.email)
    await invites.deliver({ user, token: 'secret-token' })

    expect(sent).toBe(true)
    expect(send.mock.calls[0]?.[0].text).toContain('An admin started a password reset')
    expect(invites.take(user.email)).toBe(false)
    expect(JSON.stringify(records())).toContain('Admin reset email failed')
    expect(JSON.stringify(records())).toContain('535 bad login')
    expect(JSON.stringify(records())).not.toContain('secret-token')
  })
})
