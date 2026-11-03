import { describe, expect, it, vi } from 'vitest'
import { createCapturedLogger } from '../../test/logger.ts'
import type { Mailer } from '../../shared/mail/mailer.ts'
import { buildInvite, createInviteMailer, inviteLink } from './inviteMail.ts'

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

describe('createInviteMailer', () => {
  const user = { email: 'ada@example.com', name: 'Ada' }

  it('sends the invite and records that it went out, once', async () => {
    const send = vi.fn<Mailer['send']>().mockResolvedValue(undefined)
    const invites = createInviteMailer({ send }, webBaseUrl, createCapturedLogger().logger)

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

    await expect(invites.deliver({ user, token: 'secret-token' })).resolves.toBeUndefined()

    expect(invites.take(user.email)).toBe(false)
    const logged = JSON.stringify(records())
    expect(logged).toContain('Invite email failed')
    expect(logged).not.toContain('secret-token')
  })

  it('knows nothing about an email it never sent to', () => {
    const invites = createInviteMailer({ send: vi.fn() }, webBaseUrl, createCapturedLogger().logger)

    expect(invites.take('nobody@example.com')).toBeUndefined()
  })
})
