import { expect, request } from '@playwright/test'
import { mailUrl } from './stack'

interface MessageList {
  messages: { ID: string }[]
}

/** The newest message to this address from the local mail catcher, as plain text. */
export async function waitForMail(to: string): Promise<string> {
  const mail = await request.newContext({ baseURL: mailUrl })
  try {
    let id: string | undefined
    await expect
      .poll(
        async () => {
          const response = await mail.get('/api/v1/search', { params: { query: `to:${to}` } })
          id = ((await response.json()) as MessageList).messages[0]?.ID
          return id
        },
        { message: `an email to ${to}`, timeout: 15_000 },
      )
      .toBeDefined()
    const message = (await (await mail.get(`/api/v1/message/${id}`)).json()) as { Text: string }
    return message.Text
  } finally {
    await mail.dispose()
  }
}

/** The set-password link inside an invite email. */
export function inviteLinkIn(text: string): string {
  const match = /https?:\/\/\S+\/set-password\?token=[^\s>"]+/.exec(text)
  if (!match) throw new Error(`No set-password link in the email:\n${text}`)
  return match[0]
}
