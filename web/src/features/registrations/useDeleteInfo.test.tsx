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
import { createDeleteInfo } from '../../mocks/data'
import { deleteInfoKeys, deleteInfoSegment, useDeleteInfo } from './useDeleteInfo'

function wrapper() {
  const client = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const url = '/v1/tournaments/t1/registrations/r1/delete-info'

describe('useDeleteInfo (D-212)', () => {
  it('keys the read under the tournament, marked so a delete can leave it alone', () => {
    const key = deleteInfoKeys.detail('t1', 'r1')

    expect(key).toContain(deleteInfoSegment)
    expect(key).toContain('r1')
    expect(deleteInfoSegment).toBe('registration-delete-info')
  })

  it('reads once, and does not read again when the window regains focus or the network returns', async () => {
    let reads = 0
    server.use(
      http.get(url, () => {
        reads += 1
        return HttpResponse.json({ deleteInfo: createDeleteInfo() })
      }),
    )
    const { result } = renderHook(() => useDeleteInfo('t1', 'r1'), { wrapper: wrapper() })
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
      http.get(url, () => {
        reads += 1
        return HttpResponse.json({ message: 'Registration not found' }, { status: 404 })
      }),
    )
    const { result } = renderHook(() => useDeleteInfo('t1', 'r1'), { wrapper: wrapper() })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    await pause(60)

    expect(reads).toBe(1)
  })

  it('retries another failure once, and no more', async () => {
    let reads = 0
    server.use(
      http.get(url, () => {
        reads += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { result } = renderHook(() => useDeleteInfo('t1', 'r1'), { wrapper: wrapper() })

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true)
      },
      { timeout: 4000 },
    )
    await pause(1300)

    expect(reads).toBe(2)
  })

  it('is read fresh on every mount and dropped when nobody watches it', async () => {
    let reads = 0
    server.use(
      http.get(url, () => {
        reads += 1
        return HttpResponse.json({ deleteInfo: createDeleteInfo() })
      }),
    )
    const client = new QueryClient()
    const wrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const first = renderHook(() => useDeleteInfo('t1', 'r1'), { wrapper: wrap })
    await waitFor(() => {
      expect(first.result.current.data).toBeDefined()
    })
    first.unmount()
    await waitFor(() => {
      expect(client.getQueryCache().find({ queryKey: deleteInfoKeys.detail('t1', 'r1') })).toBe(
        undefined,
      )
    })

    renderHook(() => useDeleteInfo('t1', 'r1'), { wrapper: wrap })

    await waitFor(() => {
      expect(reads).toBe(2)
    })
  })
})
