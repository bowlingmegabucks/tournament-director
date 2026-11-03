import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../mocks/server'
import { mockUsers } from '../../mocks/userHandlers'
import { meKeys } from '../auth/useMe'
import {
  useCreateUser,
  useSendPasswordReset,
  useSetUserDisabled,
  useUpdateUserRoles,
  useUserOptions,
  useUsers,
  userKeys,
} from './useUsers'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useUsers', () => {
  it('loads the list under the list key', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useUsers(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockUsers)
    expect(client.getQueryData(userKeys.list)).toEqual(mockUsers)
  })

  it('passes a failed load through as an error', async () => {
    server.use(http.get('/v1/users', () => new HttpResponse(null, { status: 403 })))
    const { wrapper } = setup()
    const { result } = renderHook(() => useUsers(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useUserOptions', () => {
  it('loads the options under the options key', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useUserOptions(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.roles).toEqual(['scoreKeeper', 'director', 'admin'])
    expect(client.getQueryData(userKeys.options)).toBeDefined()
  })
})

describe('useCreateUser', () => {
  it('marks the list stale after a user is added', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(userKeys.list, [])
    const { result } = renderHook(() => useCreateUser(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ name: 'Bea', email: 'bea@example.com', roles: ['director'] }),
    )

    expect(client.getQueryState(userKeys.list)?.isInvalidated).toBe(true)
  })

  it('leaves other cached data alone after a user is added', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(userKeys.options, { roles: [], inviteEmail: true })
    const { result } = renderHook(() => useCreateUser(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ name: 'Bea', email: 'bea@example.com', roles: ['director'] }),
    )

    expect(client.getQueryState(userKeys.options)?.isInvalidated).toBe(false)
  })

  it('leaves the list alone when the add fails', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(userKeys.list, [])
    const { result } = renderHook(() => useCreateUser(), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ name: 'Taken', email: 'taken@example.com', roles: ['admin'] })
        .catch(() => undefined)
    })

    expect(client.getQueryState(userKeys.list)?.isInvalidated).toBe(false)
  })
})

describe('useSendPasswordReset', () => {
  it('sends the reset for a user id', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useSendPasswordReset(), { wrapper })

    await act(() => result.current.mutateAsync('u-dee'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('fails for an unknown user', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useSendPasswordReset(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('nobody').catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useSetUserDisabled', () => {
  it('marks the list stale after a change', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(userKeys.list, [])
    const { result } = renderHook(() => useSetUserDisabled(), { wrapper })

    client.setQueryData(['tournaments'], [])

    await act(() => result.current.mutateAsync({ userId: 'u-dee', disabled: true }))

    expect(client.getQueryState(userKeys.list)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['tournaments'])?.isInvalidated).toBe(false)
  })
})

describe('useUpdateUserRoles', () => {
  it('marks the list and who-am-I stale after a change', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(userKeys.list, [])
    client.setQueryData(meKeys.all, {})
    client.setQueryData(['tournaments'], [])
    const { result } = renderHook(() => useUpdateUserRoles(), { wrapper })

    await act(() => result.current.mutateAsync({ userId: 'u-dee', roles: ['director'] }))

    expect(client.getQueryState(userKeys.list)?.isInvalidated).toBe(true)
    expect(client.getQueryState(meKeys.all)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['tournaments'])?.isInvalidated).toBe(false)
  })
})
