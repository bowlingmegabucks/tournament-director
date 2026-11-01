import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSignIn } from './useMe'

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
