import type { PrismaClient } from '../shared/database.ts'
import { divisionId } from './seedDivisions.ts'
import { sessionId } from './seedSessions.ts'
import { samples as sampleTournaments } from './seedTournaments.ts'

// `division` is a number from `seedDivisions`; `squads` and `sweepers` are the numbers from
// `seedSessions`. Squad 1 is complete and squad 3 has no entries, so the summary shows both. Two
// bowlers share a name and one has no USBC ID, so the list shows a stable order and a blank ID.
// A super sweeper bowler is in both sweepers (REG-06). No row ever holds an SSN.
const samples = [
  {
    n: 1,
    first: 'Dana',
    last: 'Abbott',
    suffix: '',
    usbc: '4821-10394',
    gender: null,
    division: 1,
    squads: [1, 2],
    sweepers: [1, 2],
    superSweeper: 1,
  },
  {
    n: 2,
    first: 'Ray',
    last: 'Baptiste',
    suffix: 'Jr',
    usbc: '1190-55820',
    gender: null,
    division: 1,
    squads: [1],
    sweepers: [],
    superSweeper: 0,
  },
  {
    n: 3,
    first: 'Maria',
    last: 'Chen',
    suffix: '',
    usbc: '3377-20418',
    gender: 1,
    division: 2,
    squads: [1, 2],
    sweepers: [1, 2],
    superSweeper: 1,
  },
  {
    n: 4,
    first: 'Tom',
    last: 'Delgado',
    suffix: '',
    usbc: '',
    gender: null,
    division: 1,
    squads: [2],
    sweepers: [1],
    superSweeper: 0,
  },
  {
    n: 5,
    first: 'Joe',
    last: 'Fontaine',
    suffix: '',
    usbc: '2045-88123',
    gender: null,
    division: 1,
    squads: [1, 2],
    sweepers: [],
    superSweeper: 0,
  },
  {
    n: 6,
    first: 'Joe',
    last: 'Fontaine',
    suffix: '',
    usbc: '5560-11902',
    gender: null,
    division: 2,
    squads: [2],
    sweepers: [],
    superSweeper: 0,
  },
  {
    n: 7,
    first: 'Priya',
    last: 'Nair',
    suffix: '',
    usbc: '7312-44019',
    gender: null,
    division: 3,
    squads: [1],
    sweepers: [2],
    superSweeper: 0,
  },
]

// A fixed id per tournament and number, so running the seed twice updates these rows and adds none.
// `e` is a bowler and `f` a registration. The squad and sweeper ids come from `seedSessions`, so the
// two seeds cannot drift apart. Both kinds are hex, so the id stays a valid UUID.
function rowId(tournamentId: string, kind: 'e' | 'f', n: number): string {
  return `${tournamentId.slice(0, -4)}${kind}00${n}`
}

/**
 * Put seven sample bowlers and their registrations in each sample tournament from
 * `seedTournaments`. `seedDivisions` and `seedSessions` must run first (these rows point to them).
 * Safe to run again. Local use only.
 */
export async function seedRegistrations(client: PrismaClient): Promise<number> {
  const rows = sampleTournaments.flatMap(({ id }) =>
    samples.map((sample) => ({ ...sample, tournamentId: id })),
  )

  // Each step points at the one before, so they run in order.
  await Promise.all(
    rows.map(({ tournamentId, n, first, last, suffix, usbc, gender }) => {
      // Raw SQL, like the other seeds: it writes the legacy columns directly. The text columns
      // are NOT NULL and hold '' when empty, including the encrypted SSN.
      return client.$executeRaw`
        INSERT INTO Bowlers
          (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
           ZipCode, EmailAddress, PhoneNumber, USBCId, Gender, SocialSecurityNumber)
        VALUES (${rowId(tournamentId, 'e', n)}, ${first}, '', ${last}, ${suffix}, '', '', '', '', '',
                '', ${usbc}, ${gender}, '')
        ON DUPLICATE KEY UPDATE
          FirstName = VALUES(FirstName), LastName = VALUES(LastName), Suffix = VALUES(Suffix),
          USBCId = VALUES(USBCId), Gender = VALUES(Gender)`
    }),
  )
  await Promise.all(
    rows.map(({ tournamentId, n, division, superSweeper }) => {
      return client.$executeRaw`
        INSERT INTO Registrations (Id, BowlerId, DivisionId, SuperSweeper)
        VALUES (${rowId(tournamentId, 'f', n)}, ${rowId(tournamentId, 'e', n)},
                ${divisionId(tournamentId, division)}, ${superSweeper})
        ON DUPLICATE KEY UPDATE
          DivisionId = VALUES(DivisionId), SuperSweeper = VALUES(SuperSweeper)`
    }),
  )
  await Promise.all(
    rows.flatMap(({ tournamentId, n, squads, sweepers }) => [
      ...squads.map((squad) =>
        insertLink(client, rowId(tournamentId, 'f', n), sessionId(tournamentId, 'a', squad)),
      ),
      ...sweepers.map((sweeper) =>
        insertLink(client, rowId(tournamentId, 'f', n), sessionId(tournamentId, 'b', sweeper)),
      ),
    ]),
  )
  return rows.length
}

function insertLink(client: PrismaClient, registrationId: string, squadId: string) {
  return client.$executeRaw`
    INSERT INTO SquadRegistration (RegistrationId, SquadId)
    VALUES (${registrationId}, ${squadId})
    ON DUPLICATE KEY UPDATE SquadId = VALUES(SquadId)`
}
