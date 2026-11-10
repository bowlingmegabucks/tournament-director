import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  createGame,
  createGameBowler,
  createGamePair,
  createGamesView,
} from '../../mocks/gamesData'
import { server } from '../../mocks/server'
import { gamesKeys } from './useGames'
import { useSaveScore } from './useSaveScore'

const ann = createGameBowler({ registrationId: 'ann', scores: [null, null, null] })
const view = createGamesView({
  games: [
    createGame(1, [createGamePair(1, [ann])]),
    createGame(2, [createGamePair(1, [ann])]),
    createGame(3, [createGamePair(1, [ann])]),
  ],
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = gamesKeys.view('squad', 't1', 's1')
  client.setQueryData(key, view)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSaveScore('squad', 't1', 's1'), { wrapper })
  return { ...hook, client, key }
}

const path = '/v1/tournaments/t1/squads/s1/scores/ann/3'

describe('useSaveScore (SCR-19, D-228, D-229)', () => {
  it('lays the saved scores over the games at once, filled games included', async () => {
    server.use(http.put(path, () => HttpResponse.json({ scores: [0, 0, 167], total: 167 })))
    const { result, client, key } = setup()

    await act(async () => {
      await result.current.mutateAsync({ registrationId: 'ann', game: 3, score: 167 })
    })

    const next = client.getQueryData<typeof view>(key)
    expect(next?.games[2]?.pairs[0]?.bowlers[0]).toMatchObject({ score: 167, scores: [0, 0, 167] })
    expect(next?.games.map((game) => game.entered)).toEqual([1, 1, 1])
  })

  it('clears with a null score', async () => {
    let method = ''
    server.use(
      http.delete(path, ({ request }) => {
        method = request.method
        return HttpResponse.json({ scores: [null, null, null], total: 0 })
      }),
    )
    const { result } = setup()

    await act(async () => {
      await result.current.mutateAsync({ registrationId: 'ann', game: 3, score: null })
    })

    expect(method).toBe('DELETE')
  })

  it('leaves the games as they were when the save is refused, and passes the error on', async () => {
    server.use(
      http.put(path, () =>
        HttpResponse.json({ message: 'This squad is complete.' }, { status: 409 }),
      ),
    )
    const { result, client, key } = setup()

    await act(async () => {
      await result.current
        .mutateAsync({ registrationId: 'ann', game: 3, score: 167 })
        .catch(() => undefined)
    })

    await waitFor(() => {
      expect(result.current.error?.message).toBe('This squad is complete.')
    })
    expect(client.getQueryData(key)).toEqual(view)
  })

  it('does nothing to the cache when the games are not loaded', async () => {
    server.use(http.put(path, () => HttpResponse.json({ scores: [0, 0, 167], total: 167 })))
    const { result, client, key } = setup()
    client.removeQueries({ queryKey: key })

    await act(async () => {
      await result.current.mutateAsync({ registrationId: 'ann', game: 3, score: 167 })
    })

    expect(client.getQueryData(key)).toBeUndefined()
  })
})
