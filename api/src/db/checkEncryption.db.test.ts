import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDatabaseClient, type PrismaClient } from '../shared/database.ts'
import { createEncryption } from '../shared/encryption/encryption.ts'
import { legacyVectors } from '../shared/encryption/legacyVectors.ts'
import { resetDatabase } from '../test/resetDatabase.ts'
import { checkStoredValues, readStoredValues } from './checkEncryptionCore.ts'

const [nine, , , longKey] = legacyVectors

async function addBowler(client: PrismaClient, ssn: string): Promise<void> {
  await client.$executeRaw`
    INSERT INTO Bowlers
      (Id, FirstName, MiddleInitial, LastName, Suffix, StreetAddress, CityAddress, StateAddress,
       ZipCode, EmailAddress, PhoneNumber, USBCId, DateOfBirth, Gender, SocialSecurityNumber)
    VALUES (${crypto.randomUUID()}, 'Ray', '', 'Baptiste', '', '', '', '', '', '', '', '', NULL, 0, ${ssn})`
}

describe('encryption:check on MariaDB (D-266, SEC-06)', () => {
  let client: PrismaClient

  beforeAll(() => {
    client = createDatabaseClient(inject('databaseUrl'))
  })
  afterAll(async () => {
    await client.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(client)
  })

  it('reads the stored column that model reads leave out (BWL-17)', async () => {
    await addBowler(client, nine?.cipherText ?? '')
    await addBowler(client, '')

    const values = await readStoredValues(client)

    expect(values.toSorted()).toEqual(['', nine?.cipherText ?? ''])
    expect(Object.keys((await client.bowler.findFirstOrThrow()) as object)).not.toContain(
      'socialSecurityNumber',
    )
  })

  it('opens a value legacy wrote with the legacy key', async () => {
    await addBowler(client, nine?.cipherText ?? '')
    await addBowler(client, '')

    const counts = await checkStoredValues(
      await readStoredValues(client),
      createEncryption(nine?.key ?? ''),
    )

    expect(counts).toEqual({ total: 2, empty: 1, nineDigits: 1, otherText: 0, failed: 0 })
  })

  it('reports a wrong key as a failure', async () => {
    await addBowler(client, nine?.cipherText ?? '')

    const counts = await checkStoredValues(
      await readStoredValues(client),
      createEncryption(longKey?.key ?? ''),
    )

    expect(counts).toMatchObject({ total: 1, nineDigits: 0, failed: 1 })
  })
})
