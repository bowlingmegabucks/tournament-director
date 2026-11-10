import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { createGame, createGamePair, createGamesView } from '../../mocks/gamesData'
import { server } from '../../mocks/server'
import { gamesKeys, useGames } from './useGames'

function setup(kind: 'squad' | 'sweeper') {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useGames(kind, 't1', 's1'), { wrapper })
}

describe('useGames (SCR-22)', () => {
  it('keys the games under the session, apart from its other reads', () => {
    expect(gamesKeys.view('squad', 't1', 's1')).not.toEqual(gamesKeys.view('sweeper', 't1', 's1'))
    expect(gamesKeys.view('squad', 't1', 's1')).not.toEqual(gamesKeys.view('squad', 't1', 's2'))
    expect(gamesKeys.view('squad', 't1', 's1').slice(-2)).toEqual(['scores', 'games'])
  })

  it('reads the games of a squad and of a sweeper', async () => {
    const view = createGamesView({ games: [createGame(1, [createGamePair(1, [])])] })
    server.use(
      http.get('/v1/tournaments/t1/squads/s1/scores/games', () => HttpResponse.json(view)),
      http.get('/v1/tournaments/t1/sweepers/s1/scores/games', () =>
        HttpResponse.json({ ...view, session: { ...view.session, kind: 'sweeper' } }),
      ),
    )
    const squad = setup('squad')
    const sweeper = setup('sweeper')

    await waitFor(() => {
      expect(squad.result.current.data).toEqual(view)
      expect(sweeper.result.current.data?.session.kind).toBe('sweeper')
    })
  })

  it('does not ask again for a session that is not there', async () => {
    let asked = 0
    server.use(
      http.get('/v1/tournaments/t1/squads/s1/scores/games', () => {
        asked += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )
    const { result } = setup('squad')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(asked).toBe(1)
  })
})
