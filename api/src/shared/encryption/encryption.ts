import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

// The legacy WinForms format, byte for byte (SEC-03 to SEC-08, D-262):
// Base64( salt[32] ‖ iv[32] ‖ AES-256-CBC(PKCS7) ciphertext ). The key is PBKDF2-SHA256 of the
// `ENCRYPTION_KEY` text and the salt, 100,000 rounds. Only the first 16 IV bytes are used.
const SALT_BYTES = 32
const IV_BYTES = 32
const IV_USED_BYTES = 16
const KEY_BYTES = 32
const ROUNDS = 100_000
const BLOCK_BYTES = 16

const pbkdf2Async = promisify(pbkdf2)

/** Decrypt failed: a wrong key, a damaged value, or text that is not a stored value (D-264). */
export class DecryptionError extends Error {
  constructor() {
    // A fixed message: never the input, the key, or the output.
    super('Could not decrypt the value')
    this.name = 'DecryptionError'
  }
}

export interface Encryption {
  /** `''` for `null`, `undefined`, and `''` (SEC-07). Whitespace is a value and is encrypted. */
  encrypt(plainText: string | null | undefined): Promise<string>
  /** `''` for `null`, `undefined`, and `''`. Rejects with `DecryptionError` on anything else bad. */
  decrypt(cipherText: string | null | undefined): Promise<string>
  /** Decrypts both and compares the text (legacy `ValuesMatch`). */
  valuesMatch(first: string, second: string): Promise<boolean>
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

function derive(key: string, salt: Buffer): Promise<Buffer> {
  // Async: it runs on Node's thread pool, so a report that decrypts a list leaves the event loop free.
  return pbkdf2Async(key, salt, ROUNDS, KEY_BYTES, 'sha256')
}

/** `key` is the shared `ENCRYPTION_KEY`. A secret: never log it. */
export function createEncryption(key: string): Encryption {
  async function encrypt(plainText: string | null | undefined): Promise<string> {
    if (plainText === null || plainText === undefined || plainText === '') return ''
    const salt = randomBytes(SALT_BYTES)
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-cbc', await derive(key, salt), iv.subarray(0, IV_USED_BYTES))
    const body = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    return Buffer.concat([salt, iv, body]).toString('base64')
  }

  async function decrypt(cipherText: string | null | undefined): Promise<string> {
    if (cipherText === null || cipherText === undefined || cipherText === '') return ''
    // Buffer.from skips bad Base64 without a word, so check the text first.
    if (cipherText.length % 4 !== 0 || !BASE64.test(cipherText)) throw new DecryptionError()
    const bytes = Buffer.from(cipherText, 'base64')
    const bodyStart = SALT_BYTES + IV_BYTES
    // At least one cipher block, and whole blocks only.
    if (bytes.length < bodyStart + BLOCK_BYTES || (bytes.length - bodyStart) % BLOCK_BYTES !== 0) {
      throw new DecryptionError()
    }
    try {
      const salt = bytes.subarray(0, SALT_BYTES)
      const iv = bytes.subarray(SALT_BYTES, bodyStart)
      const decipher = createDecipheriv(
        'aes-256-cbc',
        await derive(key, salt),
        iv.subarray(0, IV_USED_BYTES),
      )
      const plain = Buffer.concat([decipher.update(bytes.subarray(bodyStart)), decipher.final()])
      return plain.toString('utf8')
    } catch {
      // Bad padding, usually a wrong key. Say nothing more (D-264).
      throw new DecryptionError()
    }
  }

  async function valuesMatch(first: string, second: string): Promise<boolean> {
    const [a, b] = await Promise.all([decrypt(first), decrypt(second)])
    return a === b
  }

  return { encrypt, decrypt, valuesMatch }
}
