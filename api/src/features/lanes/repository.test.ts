import { describe, expect, it } from 'vitest'
import { createLaneEntry } from '../../test/factories.ts'
import { createInMemoryLaneRepository } from './repository.ts'

describe('in-memory lane repository', () => {
  it('lists only the entries of the session asked for (LAN-10)', async () => {
    const mine = createLaneEntry({ position: '1A' })
    const repository = createInMemoryLaneRepository([
      { sessionId: 'a', entry: mine },
      { sessionId: 'b', entry: createLaneEntry() },
    ])

    expect(await repository.listEntries('a')).toEqual([mine])
  })

  it('gives an empty list for an unknown session', async () => {
    expect(await createInMemoryLaneRepository([]).listEntries('a')).toEqual([])
  })

  it('hands out copies, so a caller cannot change the stored entry', async () => {
    const repository = createInMemoryLaneRepository([
      { sessionId: 'a', entry: createLaneEntry({ position: '1A' }) },
    ])

    const [first] = await repository.listEntries('a')
    if (first) first.position = '9Z'

    expect((await repository.listEntries('a'))[0]?.position).toBe('1A')
  })
})
