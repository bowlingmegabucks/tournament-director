import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { meKeys, useMe, useSignIn, useSignOut } from './useMe'

describe('useSignIn', () => {
  it('refetches data cached while signed out', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['squads', 1], ['old'])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSignIn(), { wrapper })

    result.current.mutate({ email: 'admin@example.com', password: 'adminP4sswordLocal' })

    await waitFor(() => {
      expect(client.getQueryState(['squads', 1])?.isInvalidated).toBe(true)
    })
  })
})

// Fetch counters, to see which queries a sign-in or sign-out touches.
function countFetches() {
  const counts = { me: 0, other: 0 }
  server.use(
    http.get('/v1/me', () => {
      counts.me += 1
      return HttpResponse.json({ user: null })
    }),
  )
  const getOther = () => {
    counts.other += 1
    return Promise.resolve({})
  }
  return { counts, getOther }
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useSignIn refetching', () => {
  it('refetches who is signed in once, and each other query once', async () => {
    const { counts, getOther } = countFetches()
    const { client, wrapper } = setup()
    const { result } = renderHook(
      () => ({
        me: useMe(),
        other: useQuery({ queryKey: ['other'], queryFn: getOther }),
        signIn: useSignIn(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.other.isSuccess && result.current.me.isSuccess).toBe(true)
    })
    expect(counts).toEqual({ me: 1, other: 1 })

    result.current.signIn.mutate({ email: 'admin@example.com', password: 'adminP4sswordLocal' })

    await waitFor(() => {
      expect(result.current.signIn.isSuccess).toBe(true)
    })
    expect(counts).toEqual({ me: 2, other: 2 })
    expect(client.getQueryState(meKeys.all)?.isInvalidated).toBe(false)
  })
})

describe('useSignOut', () => {
  it('shows signed out at once, and clears the other queries but not who is signed in', async () => {
    const { counts, getOther } = countFetches()
    const { client, wrapper } = setup()
    const { result } = renderHook(
      () => ({
        me: useMe(),
        other: useQuery({ queryKey: ['other'], queryFn: getOther }),
        signOut: useSignOut(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.other.isSuccess && result.current.me.isSuccess).toBe(true)
    })

    result.current.signOut.mutate()

    await waitFor(() => {
      expect(result.current.signOut.isSuccess).toBe(true)
    })
    await waitFor(() => {
      expect(counts.other).toBe(2)
    })
    expect(counts.me).toBe(1)
    expect(client.getQueryData(meKeys.all)).toEqual({ user: null })
  })
})
