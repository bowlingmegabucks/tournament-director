import { describe, expect, it } from 'vitest'
import { createInMemoryScoreRepository } from './repository.ts'

const row = { bowlerId: 'b', game: 1, score: 200 }

describe('in-memory score repository', () => {
  it('lists only the scores of the session asked for (SCR-16)', async () => {
    const repository = createInMemoryScoreRepository([
      { sessionId: 'a', score: row },
      { sessionId: 'b', score: { ...row, game: 2 } },
    ])

    expect(await repository.listScores('a')).toEqual([row])
  })

  it('gives an empty list for an unknown session', async () => {
    expect(await createInMemoryScoreRepository([]).listScores('a')).toEqual([])
  })

  it('hands out copies, so a caller cannot change the stored score', async () => {
    const repository = createInMemoryScoreRepository([{ sessionId: 'a', score: { ...row } }])

    const [first] = await repository.listScores('a')
    if (first) first.score = 1

    expect((await repository.listScores('a'))[0]?.score).toBe(200)
  })
})
