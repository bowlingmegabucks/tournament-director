import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createTournament } from '../../test/factories.ts'
import { createSignedInTestApp } from '../../test/testApp.ts'
import { createInMemoryDivisionRepository } from '../divisions/repository.ts'
import { createInMemoryLaneRepository } from '../lanes/repository.ts'
import {
  field,
  idOf,
  open,
  person,
  scoresOf,
  squadOne,
  squadTwo,
  type Bowled,
} from '../noShows/noShow.testData.ts'
import { createInMemoryScoreRepository } from '../scores/repository.ts'
import { createInMemorySquadRepository } from '../squads/repository.ts'
import { createInMemoryTournamentRepository } from '../tournaments/repository.ts'

const tournament = createTournament({ id: idOf(50) })
const base = `/v1/tournaments/${tournament.id}`

/** 20 entries in squad one, Cal (third) forced. Squad two: Cal again, with the best score. */
function app() {
  const first: Bowled[] = field(20).map((item, index) =>
    index === 2 ? { ...item, entry: { ...item.entry, forcedAdvancer: true } } : item,
  )
  const second: Bowled[] = [{ entry: person(2), score: 280 }, ...field(13, 30)]
  const squads = [squadOne, squadTwo]
  const bowled = [first, second]
  return createSignedInTestApp(
    {
      tournaments: createInMemoryTournamentRepository([tournament], {
        [tournament.id]: { finalsRatio: 7, superSweeperCashRatio: 8 },
      }),
      divisions: createInMemoryDivisionRepository([
        { tournamentId: tournament.id, division: open },
      ]),
      squads: createInMemorySquadRepository(
        squads.map((squad) => ({ tournamentId: tournament.id, squad })),
      ),
      lanes: createInMemoryLaneRepository(
        squads.flatMap((squad, at) =>
          (bowled[at] ?? []).map((item) => ({ sessionId: squad.id, entry: item.entry })),
        ),
      ),
      scores: createInMemoryScoreRepository(
        squads.flatMap((squad, at) =>
          (bowled[at] ?? []).flatMap((item) =>
            scoresOf(item).map((score) => ({ sessionId: squad.id, score })),
          ),
        ),
      ),
    },
    'admin',
  )
}

interface Row {
  name: string
  group: string
  byRuling?: boolean
  advancedEarlier?: boolean
}

const rowsOf = async (url: string): Promise<Row[]> =>
  (await request(app()).get(url)).body.divisions[0].rows

describe('results with a forced advancer (NSH-21 to NSH-24)', () => {
  it('lists them as an advancer, marked by ruling, with the same casher', async () => {
    const rows = await rowsOf(`${base}/squads/${squadOne.id}/results`)

    expect(rows.slice(0, 4).map((row) => [row.name, row.group, row.byRuling ?? false])).toEqual([
      ['Amy Lane', 'advancer', false],
      ['Ben Lane', 'advancer', false],
      ['Cal Lane', 'advancer', true],
      ['Dee Lane', 'casher', false],
    ])
    expect(rows.filter((row) => row.group === 'casher')).toHaveLength(1)
  })

  it('does not let them advance again later: they cash as an earlier advancer (D-81)', async () => {
    const rows = await rowsOf(`${base}/squads/${squadTwo.id}/results`)

    expect(rows.filter((row) => row.group === 'advancer').map((row) => row.name)).toEqual([
      'Field30 Lane',
      'Field31 Lane',
    ])
    expect(rows.find((row) => row.name === 'Cal Lane')).toMatchObject({
      group: 'casher',
      advancedEarlier: true,
    })
  })

  it('seeds them as a finalist by ruling, whichever squad their best score is from', async () => {
    const rows = await rowsOf(`${base}/seeding`)

    expect(rows.find((row) => row.name === 'Cal Lane')).toMatchObject({
      group: 'finalist',
      byRuling: true,
    })
    expect(rows.filter((row) => row.byRuling)).toHaveLength(1)
  })

  it('keeps them out of the at-large field, and counts them against its spots', async () => {
    const response = await request(app()).get(`${base}/at-large`)

    const [division] = response.body.divisions
    // 34 entries: floor(34 / 7) = 4 spots. Advancers: Amy, Ben, Cal, Field30, Field31.
    expect(division).toMatchObject({ totalSpots: 4, squadAdvancers: 5, atLargeSpots: 0 })
    expect(division.rows).toEqual([])
  })
})
