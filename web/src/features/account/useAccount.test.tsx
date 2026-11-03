import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { meKeys } from '../auth/useMe'
import { useChangePassword, useUpdateName } from './useAccount'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useUpdateName', () => {
  it('marks only who-am-I stale after a save, so the top bar shows the new name', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(meKeys.all, {})
    client.setQueryData(['tournaments'], [])
    const { result } = renderHook(() => useUpdateName(), { wrapper })

    const saved = await act(() => result.current.mutateAsync('Dee D'))

    expect(saved).toBe('Dee D')
    expect(client.getQueryState(meKeys.all)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['tournaments'])?.isInvalidated).toBe(false)
  })
})

describe('useChangePassword', () => {
  it('changes the password and leaves cached data alone', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(meKeys.all, {})
    const { result } = renderHook(() => useChangePassword(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ currentPassword: 'old one', newPassword: 'new password 12' }),
    )

    expect(client.getQueryState(meKeys.all)?.isInvalidated).toBe(false)
  })
})
