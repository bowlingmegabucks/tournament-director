import { describe, expect, it } from 'vitest'
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../mocks/server'
import { createEditInfo } from '../../mocks/data'
import { editInfoKeys, editInfoSegment, useEditInfo } from './useEditInfo'

function wrapper() {
  const client = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('useEditInfo (D-197, D-199)', () => {
  it('keys the read under the tournament, marked so a save can leave it alone', () => {
    const key = editInfoKeys.detail('t1', 'r1')

    expect(key).toContain(editInfoSegment)
    expect(key).toContain('r1')
    expect(editInfoSegment).toBe('registration-edit')
  })

  it('reads once, and does not read again when the window regains focus or the network returns', async () => {
    let reads = 0
    server.use(
      http.get('/v1/tournaments/t1/registrations/r1/edit-info', () => {
        reads += 1
        return HttpResponse.json(createEditInfo())
      }),
    )
    const { result } = renderHook(() => useEditInfo('t1', 'r1'), { wrapper: wrapper() })
    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    focusManager.setFocused(false)
    focusManager.setFocused(true)
    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
    await pause(60)

    expect(reads).toBe(1)
  })

  it('does not retry a registration that is not found', async () => {
    let reads = 0
    server.use(
      http.get('/v1/tournaments/t1/registrations/r1/edit-info', () => {
        reads += 1
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }),
    )
    const { result } = renderHook(() => useEditInfo('t1', 'r1'), { wrapper: wrapper() })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await pause(60)

    expect(reads).toBe(1)
  })

  it('retries another failure once', async () => {
    let reads = 0
    server.use(
      http.get('/v1/tournaments/t1/registrations/r1/edit-info', () => {
        reads += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { result } = renderHook(() => useEditInfo('t1', 'r1'), { wrapper: wrapper() })

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 4000 },
    )

    expect(reads).toBe(2)
  })
})
