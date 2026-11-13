import { describe, expect, it } from 'vitest'
import { createEncryption } from '../shared/encryption/encryption.ts'
import { legacyVectors } from '../shared/encryption/legacyVectors.ts'
import { checkStoredValues, describeCounts, hasProblems } from './checkEncryptionCore.ts'

const [nine, , , longKey] = legacyVectors
const encryption = createEncryption(nine?.key ?? '')

describe('checkStoredValues (D-266)', () => {
  it('counts each kind of stored value', async () => {
    const wrongKeyValue = longKey?.cipherText ?? '' // made with another key: fails the padding check
    const counts = await checkStoredValues(
      [
        nine?.cipherText ?? '',
        await encryption.encrypt('555443333'),
        '',
        '',
        await encryption.encrypt('not digits'),
        wrongKeyValue,
        'not base64!',
      ],
      encryption,
    )

    expect(counts).toEqual({ total: 7, empty: 2, nineDigits: 2, otherText: 1, failed: 2 })
  })

  it('counts nothing for no rows', async () => {
    expect(await checkStoredValues([], encryption)).toEqual({
      total: 0,
      empty: 0,
      nineDigits: 0,
      otherText: 0,
      failed: 0,
    })
  })

  it('handles more rows than one batch', async () => {
    const value = await encryption.encrypt('123456789')

    const counts = await checkStoredValues(
      Array.from({ length: 120 }, () => value),
      encryption,
    )

    expect(counts).toMatchObject({ total: 120, nineDigits: 120, failed: 0 })
  })

  it('rethrows an error that is not a failed decrypt', async () => {
    const broken = { ...encryption, decrypt: () => Promise.reject(new Error('disk on fire')) }

    await expect(checkStoredValues(['abc'], broken)).rejects.toThrow('disk on fire')
  })
})

describe('describeCounts and hasProblems (D-266)', () => {
  const good = { total: 3, empty: 1, nineDigits: 2, otherText: 0, failed: 0 }

  it('says OK when every value opens', () => {
    expect(hasProblems(good)).toBe(false)
    expect(describeCounts(good).at(-1)).toMatch(/^OK/)
  })

  it.each([{ failed: 1 }, { otherText: 1 }])('flags a problem for %j', (change) => {
    const counts = { ...good, ...change }

    expect(hasProblems(counts)).toBe(true)
    expect(describeCounts(counts).at(-1)).toMatch(/^PROBLEM/)
  })

  it('prints each count', () => {
    expect(
      describeCounts({ total: 9, empty: 8, nineDigits: 7, otherText: 6, failed: 5 }).join('\n'),
    ).toMatch(/checked:\s+9[\s\S]*file:\s+8[\s\S]*9 digits:\s+7[\s\S]*text:\s+6[\s\S]*decrypt:\s+5/)
  })
})
