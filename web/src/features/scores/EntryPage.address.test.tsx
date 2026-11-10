import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createGame, createGameBowler, createGamePair } from '../../mocks/gamesData'
import { openEntry, serve, signInKeeper, viewOf } from './entryTestSupport'

beforeEach(() => {
  signInKeeper()
})

describe('score entry: the address (SCR-21, D-230)', () => {
  it('says the session has no games when it has none, and does not go round in circles', async () => {
    serve({ ...viewOf(), games: [] })
    openEntry('/1')
    expect(await screen.findByText('This squad has no games.')).toBeVisible()
  })

  it('opens the sheet of a pair whose first lane has two digits', async () => {
    const view = viewOf()
    const bowler = createGameBowler({ registrationId: 'ann', name: 'Ann Lee', lane: '13A' })
    serve({
      ...view,
      games: [createGame(1, [createGamePair(13, [bowler])]), ...view.games.slice(1)],
    })
    openEntry('/1/13')
    expect(await screen.findByRole('textbox', { name: /Ann Lee, game 1$/ })).toBeVisible()
  })

  it.each(['0', '1234', 'x'])('treats the lane "%s" as no pair picked', async (lane) => {
    serve()
    openEntry(`/2/${lane}`)
    expect(await screen.findByText('Pick a pair to enter its scores.')).toBeVisible()
  })

  it('says no bowlers are on lanes the game does not list', async () => {
    serve()
    openEntry('/2/7')
    expect(await screen.findByText('No bowlers on lanes 7-8 in game 2.')).toBeVisible()
  })
})
