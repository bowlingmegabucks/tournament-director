# Encryption

Built on branch `encryption`. Migration source: [docs/migration/security.md](../migration/security.md). Review: [docs/security-review-encryption.md](../security-review-encryption.md).

This slice builds the means to encrypt and decrypt a stored SSN, in the legacy desk app's exact format. **No route, screen, or write uses it yet.** The first use is a later payout report; the SSN screens, Verify, and the SSN edit wait for it (`SEC-09`, `SEC-10`, `BWL-11`, `BWL-16`, Q-22).

## Settings and fields

| Name                           | Where                                           | Notes                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`               | API env var (App Service setting in production) | Required. The same text as the desk app's `EncryptionKey`. Any length, used exactly as given (no trim), not empty. Never logged. Loaded only in `config.ts` as `Config.encryptionKey` (D-263) |
| `Bowlers.SocialSecurityNumber` | database column                                 | longtext, the stored value, `''` when none. Not selected by any model read (`BWL-17`)                                                                                                         |

Stored value: Base64 of `salt (32 bytes) ‖ iv (32 bytes) ‖ ciphertext`.

## Rules

| ID     | Requirement                                                                                                                                                     | Differs from legacy                                                                      | Tests                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-03 | Encrypts and decrypts with AES-256-CBC and PKCS7 padding. Values made by the legacy code decrypt, and values made here decrypt in legacy                        |                                                                                          | `api/src/shared/encryption/encryption.test.ts` (legacy vectors; "grows by one block"); the reverse check is described in the review                    |
| SEC-04 | The key is PBKDF2-SHA256 of the `ENCRYPTION_KEY` text and a random 32-byte salt, 100,000 rounds, 32 bytes out. Each value has its own salt                      | Async `pbkdf2`, so a report that decrypts a list does not block the event loop (D-262)   | `encryption.test.ts` ("uses a new salt and IV for each value"; legacy vectors, including a long key with symbols)                                      |
| SEC-05 | A random 32-byte IV is stored; only the first 16 bytes are used                                                                                                 |                                                                                          | `encryption.test.ts` ("uses only the first 16 IV bytes", "changes the result when a used IV byte changes")                                             |
| SEC-06 | The stored value is Base64 of salt, IV, then ciphertext                                                                                                         |                                                                                          | `encryption.test.ts` ("makes Base64 of salt, IV, and whole cipher blocks"); `api/src/db/checkEncryption.db.test.ts` (a legacy value read from MariaDB) |
| SEC-07 | `null`, `undefined`, and `''` encrypt to `''`, and `''` decrypts to `''`. Whitespace is a value and is encrypted                                                |                                                                                          | `encryption.test.ts` ("empty values"; the whitespace case and the "one space" legacy vector)                                                           |
| SEC-08 | Decrypt: Base64-decode, split at 32 and 64 bytes, derive the key from the salt, decrypt with the first 16 IV bytes                                              |                                                                                          | `encryption.test.ts` (legacy vectors)                                                                                                                  |
| SEC-11 | The API loads the key and never returns an SSN. It does not start without the key                                                                               | Yes: legacy says the API never loads the key (D-263)                                     | `api/src/config.test.ts` ("fails without ENCRYPTION_KEY", "rejects ENCRYPTION_KEY", "keeps it as given", "does not print the encryption key")          |
| SEC-13 | A logged object never carries `ssn`, `socialSecurityNumber`, or `encryptionKey`, at the top level or one level down                                             | New: legacy logs whole requests (D-265)                                                  | `api/src/shared/logger.test.ts` ("redaction")                                                                                                          |
| SEC-09 | The browser does not encrypt. The API encrypts over HTTPS                                                                                                       | Yes: legacy encrypts in the desk app on blur (D-261). **Built with the first SSN route** | None yet. The reasons are in the review                                                                                                                |
| D-264  | A failed decrypt rejects with `DecryptionError`, whose message holds no key, ciphertext, or plaintext                                                           | New                                                                                      | `encryption.test.ts` ("a failed decrypt")                                                                                                              |
| D-266  | `npm run encryption:check` counts stored SSNs as empty, 9 digits, other text, and failed, and prints no value or id. It exits 1 on any failed or other-text row | New                                                                                      | `api/src/db/checkEncryptionCore.test.ts`; `api/src/db/checkEncryption.db.test.ts`                                                                      |

Already done before this slice: `SEC-11a` (D-05) and the never-shown half of `BWL-17`.

## API

No new route and no change to any response. `createEncryption(key)` returns `{ encrypt, decrypt, valuesMatch }`, all asynchronous, in `api/src/shared/encryption/encryption.ts`. It is not in `createApp(deps)` yet: the first SSN route adds it.

## Screens

None.

## Scripts

`npm run encryption:check` in `api/`. It reads `DATABASE_URL` and `ENCRYPTION_KEY` from `.env` or the environment, prints the database as `host:port/name`, then the counts and an OK or PROBLEM line. Run it against production data from your machine with both variables set. It is not part of CI.
