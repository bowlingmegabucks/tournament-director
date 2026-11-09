import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { bowlerKeys, useBowlerSearch } from './useBowlerSearch'
import { useBowler } from './useBowler'

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const filter = { lastName: 'Gon', firstName: '', email: '', usbcId: '' }

describe('bowlerKeys', () => {
  it('keys a search and a detail under their tournament, apart from each other', () => {
    expect(bowlerKeys.search('t1', filter)).toEqual(['tournaments', 't1', 'bowler-search', filter])
    expect(bowlerKeys.detail('t1', 'b1')).toEqual(['tournaments', 't1', 'bowler', 'b1'])
  })
})

describe('useBowlerSearch (BWL-14)', () => {
  it('does not search before a filter is submitted', () => {
    let calls = 0
    server.use(
      http.get('/v1/bowlers', () => {
        calls += 1
        return HttpResponse.json({ bowlers: [], more: false })
      }),
    )

    const { result } = renderHook(() => useBowlerSearch('t1', null), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(calls).toBe(0)
  })

  it('searches once a filter arrives, and does not retry a failure', async () => {
    let calls = 0
    server.use(
      http.get('/v1/bowlers', () => {
        calls += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )

    const { result } = renderHook(() => useBowlerSearch('t1', filter), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(1)
  })

  it('returns the found bowlers', async () => {
    server.use(http.get('/v1/bowlers', () => HttpResponse.json({ bowlers: [], more: true })))

    const { result } = renderHook(() => useBowlerSearch('t1', filter), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual({ bowlers: [], more: true })
    })
  })
})

describe('useBowler (D-165)', () => {
  it('does not read again when the window is focused again, so the form keeps one picture', async () => {
    let calls = 0
    server.use(
      http.get('/v1/bowlers/:id', () => {
        calls += 1
        return HttpResponse.json({
          bowler: {
            id: 'b1',
            firstName: 'Maria',
            middleInitial: '',
            lastName: 'Gonzalez',
            suffix: '',
            street: '',
            city: '',
            state: '',
            zipCode: '',
            email: '',
            phoneNumber: '',
            usbcId: '',
            dateOfBirth: '',
            gender: '',
          },
          registration: null,
        })
      }),
    )
    const { result } = renderHook(() => useBowler('t1', 'b1'), { wrapper })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(calls).toBe(1)
  })

  it('waits for a bowler id', () => {
    const { result } = renderHook(() => useBowler('t1', undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
  })

  it('stops at once for a bowler who is gone', async () => {
    let calls = 0
    server.use(
      http.get('/v1/bowlers/:id', () => {
        calls += 1
        return HttpResponse.json({ message: 'Bowler not found' }, { status: 404 })
      }),
    )

    const { result } = renderHook(() => useBowler('t1', 'b1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(calls).toBe(1)
  })
})
