import { describe, expect, it } from 'vitest'
import { readJson } from './readJson'

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const response = new Response(JSON.stringify({ a: 1 }))

    await expect(readJson(response, 'Failed')).resolves.toEqual({ a: 1 })
  })

  it('names the failure when the body is not JSON', async () => {
    const response = new Response('<html></html>')

    await expect(readJson(response, 'Failed to load')).rejects.toThrow(
      'Failed to load (response is not JSON)',
    )
  })
})
