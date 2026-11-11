import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { ScoreSaveError } from './gamesApi'
import type { GamesView } from './gamesTypes'
import { useSetDnf } from './useSetDnf'
import { gamesKeys } from './useGames'
import { viewOf } from './entryTestSupport'

function setup(seed?: GamesView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = gamesKeys.view('squad', 't1', 's1')
  if (seed) client.setQueryData(key, seed)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSetDnf('squad', 't1', 's1'), { wrapper })
  const flagOf = () =>
    client
      .getQueryData<GamesView>(key)
      ?.games.flatMap((game) => game.pairs.flatMap((pair) => pair.bowlers))
      .filter((bowler) => bowler.registrationId === 'cal')
      .map((bowler) => bowler.dnf)
  return { ...hook, flagOf }
}

function serve(status = 204) {
  const methods: string[] = []
  const respond = (method: string) => {
    methods.push(method)
    return status === 204
      ? new HttpResponse(null, { status })
      : HttpResponse.json({ message: 'Refused' }, { status })
  }
  server.use(
    http.put('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', () =>
      respond('PUT'),
    ),
    http.delete('/v1/tournaments/:id/squads/:sessionId/scores/:registrationId/dnf', () =>
      respond('DELETE'),
    ),
  )
  return methods
}

describe('useSetDnf (SCR-24, D-248, D-249)', () => {
  it('sends PUT to flag a bowler and shows the flag in every game at once', async () => {
    const methods = serve()
    const { result, flagOf } = setup(viewOf({ cal: [200, null, null] }))

    result.current.mutate({ registrationId: 'cal', flagged: true })

    await waitFor(() => {
      expect(flagOf()).toEqual([true, true, true])
    })
    expect(methods).toEqual(['PUT'])
  })

  it('sends DELETE to take the flag off and clears it in the cached games', async () => {
    const methods = serve()
    const { result, flagOf } = setup(viewOf({ cal: [200, null, null] }))
    result.current.mutate({ registrationId: 'cal', flagged: true })
    await waitFor(() => {
      expect(flagOf()).toEqual([true, true, true])
    })

    result.current.mutate({ registrationId: 'cal', flagged: false })

    await waitFor(() => {
      expect(flagOf()).toEqual([false, false, false])
    })
    expect(methods).toEqual(['PUT', 'DELETE'])
  })

  it('leaves the cache alone and rejects with the API message on a refusal', async () => {
    serve(409)
    const { result, flagOf } = setup(viewOf({ cal: [200, null, null] }))

    await expect(
      result.current.mutateAsync({ registrationId: 'cal', flagged: true }),
    ).rejects.toThrow(ScoreSaveError)

    expect(flagOf()).toEqual([false, false, false])
  })

  it('saves and does not fail when the games are not cached yet', async () => {
    const methods = serve()
    const { result, flagOf } = setup()

    await result.current.mutateAsync({ registrationId: 'cal', flagged: true })

    expect(methods).toEqual(['PUT'])
    expect(flagOf()).toBeUndefined()
  })
})
