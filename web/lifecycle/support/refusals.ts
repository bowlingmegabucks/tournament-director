import { expect, type Page } from '@playwright/test'
import { apiUrl } from './stack'

/** The answer of one web API call made with the signed-in browser's cookie. */
export interface Answer {
  status: number
  body: { message?: string; errors?: Record<string, string>; [key: string]: unknown }
}

/**
 * Call the web-only API as the signed-in user: the page's request context carries the same session
 * cookie as the browser. Used for the scripted failures, which the UI hides or disables.
 */
export async function call(
  page: Page,
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<Answer> {
  const response = await page.request.fetch(`${apiUrl}${path}`, { method, data })
  const text = await response.text()
  return { status: response.status(), body: parseBody(text) }
}

function parseBody(text: string): Answer['body'] {
  if (!text) return {}
  try {
    return JSON.parse(text) as Answer['body']
  } catch {
    return { message: text }
  }
}

/** A refusal: this status, and every given text somewhere in the message or the error values. */
export function expectRefused(answer: Answer, status: number, ...texts: string[]) {
  expect(answer.status, JSON.stringify(answer.body)).toBe(status)
  const said = [answer.body.message ?? '', ...Object.values(answer.body.errors ?? {})].join(' | ')
  for (const text of texts) expect(said).toContain(text)
}
