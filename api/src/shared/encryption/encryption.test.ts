import { describe, expect, it } from 'vitest'
import { DecryptionError, createEncryption } from './encryption.ts'
import { legacyVectors } from './legacyVectors.ts'

const key = 'test-only-encryption-key'
const encryption = createEncryption(key)

describe('createEncryption', () => {
  describe('reads what legacy wrote (SEC-03, SEC-04, SEC-05, SEC-06, SEC-08, D-262)', () => {
    it.each(legacyVectors)('decrypts $label', async ({ key: legacyKey, plainText, cipherText }) => {
      expect(await createEncryption(legacyKey).decrypt(cipherText)).toBe(plainText)
    })
  })

  describe('writes what legacy can read (SEC-03, SEC-06, D-262)', () => {
    it('makes Base64 of salt, IV, and whole cipher blocks (SEC-06)', async () => {
      const stored = await encryption.encrypt('123456789')

      expect(stored).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
      const bytes = Buffer.from(stored, 'base64')
      expect(bytes.length).toBe(64 + 16)
      expect(bytes.toString('base64')).toBe(stored)
    })

    it('grows by one block when the text fills a block (PKCS7, SEC-03)', async () => {
      const stored = await encryption.encrypt('a'.repeat(16))

      expect(Buffer.from(stored, 'base64').length).toBe(64 + 32)
    })

    it('uses a new salt and IV for each value (SEC-04, SEC-05)', async () => {
      const first = await encryption.encrypt('123456789')
      const second = await encryption.encrypt('123456789')

      expect(first).not.toBe(second)
      expect(Buffer.from(first, 'base64').subarray(0, 32)).not.toEqual(
        Buffer.from(second, 'base64').subarray(0, 32),
      )
      expect(await encryption.decrypt(first)).toBe('123456789')
      expect(await encryption.decrypt(second)).toBe('123456789')
    })

    it('round-trips non-ASCII text', async () => {
      expect(await encryption.decrypt(await encryption.encrypt('Zoë–é 日本'))).toBe('Zoë–é 日本')
    })

    it('uses only the first 16 IV bytes (SEC-05)', async () => {
      const bytes = Buffer.from(await encryption.encrypt('123456789'), 'base64')
      const unusedIvByte = IV_START + 16 + 2
      bytes[unusedIvByte] = (bytes[unusedIvByte] ?? 0) ^ 0xff

      expect(await encryption.decrypt(bytes.toString('base64'))).toBe('123456789')
    })

    it('changes the result when a used IV byte changes (SEC-05)', async () => {
      const bytes = Buffer.from(await encryption.encrypt('123456789'), 'base64')
      bytes[IV_START] = (bytes[IV_START] ?? 0) ^ 0xff

      expect(await encryption.decrypt(bytes.toString('base64'))).not.toBe('123456789')
    })
  })

  describe('empty values (SEC-07)', () => {
    it.each([null, undefined, ''])('encrypts %j to an empty string', async (value) => {
      expect(await encryption.encrypt(value)).toBe('')
    })

    it.each([null, undefined, ''])('decrypts %j to an empty string', async (value) => {
      expect(await encryption.decrypt(value)).toBe('')
    })

    it.each([' ', '  '])('encrypts whitespace (%j) to a value that decrypts back', async (value) => {
      const stored = await encryption.encrypt(value)

      expect(stored).not.toBe('')
      expect(await encryption.decrypt(stored)).toBe(value)
    })
  })

  describe('a failed decrypt (D-264)', () => {
    it('rejects a wrong key with DecryptionError and a message that holds no data', async () => {
      // A fixed legacy value and a key that fails its padding check. (A wrong key passes that
      // check about 1 time in 256 and returns garbage: the CBC limit in D-264.)
      const [vector] = legacyVectors
      const wrongKey = 'not-the-legacy-key'

      const failure: unknown = await createEncryption(wrongKey)
        .decrypt(vector?.cipherText)
        .catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(DecryptionError)
      const message = failure instanceof Error ? failure.message : ''
      expect(message).toBe('Could not decrypt the value')
      expect(message).not.toContain(vector?.cipherText ?? 'x')
      expect(message).not.toContain(wrongKey)
    })

    it.each([
      ['text that is not Base64', 'not base64 at all!'],
      ['text with a bad Base64 length', 'abc'],
      ['a value that is too short', Buffer.alloc(40).toString('base64')],
      ['a value that is not whole blocks', Buffer.alloc(64 + 17).toString('base64')],
      ['a value with no cipher block', Buffer.alloc(64).toString('base64')],
    ])('rejects %s', async (_label, value) => {
      await expect(encryption.decrypt(value)).rejects.toBeInstanceOf(DecryptionError)
    })

    it('rejects a damaged cipher body', async () => {
      const bytes = Buffer.from(await encryption.encrypt('123456789'), 'base64')
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff

      await expect(encryption.decrypt(bytes.toString('base64'))).rejects.toBeInstanceOf(
        DecryptionError,
      )
    })
  })

  describe('valuesMatch', () => {
    it('is true for the same text, however it was encrypted', async () => {
      const first = await encryption.encrypt('123456789')
      const second = await encryption.encrypt('123456789')

      expect(await encryption.valuesMatch(first, second)).toBe(true)
    })

    it('is false for different text', async () => {
      const first = await encryption.encrypt('123456789')
      const second = await encryption.encrypt('987654321')

      expect(await encryption.valuesMatch(first, second)).toBe(false)
    })

    it('is true for two empty values', async () => {
      expect(await encryption.valuesMatch('', '')).toBe(true)
    })
  })
})

const IV_START = 32
