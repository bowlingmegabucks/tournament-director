import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './apiFetch'

describe('apiFetch', () => {
  afterEach(() => vi.restoreAllMocks())

  // A spy, not MSW: MSW's request object does not keep the `credentials` option.
  it('sends the session cookie and keeps the caller options', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

    await apiFetch('/v1/me', { method: 'POST', credentials: 'omit' })

    expect(fetchSpy).toHaveBeenCalledWith('/v1/me', { method: 'POST', credentials: 'include' })
  })
})
