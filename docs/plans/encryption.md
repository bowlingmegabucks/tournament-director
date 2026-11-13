# Plan: encryption

Branch: `encryption`. Delete this file when the work is done.

Source rules: [security.md](../migration/security.md) (`SEC-03` to `SEC-11`, `SEC-13`), `BWL-17`. No screen, no route, no vendor-visible change (D-09).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SEC-03 | In | AES-256-CBC, PKCS7 |
| SEC-04 | In | PBKDF2-SHA256, 100,000 rounds, 32-byte salt, key from `ENCRYPTION_KEY` |
| SEC-05 | In | 32 IV bytes stored, first 16 used |
| SEC-06 | In | Base64 of salt ‖ iv ‖ ciphertext |
| SEC-07 | In | `''` both ways; a space encrypts (D-262) |
| SEC-08 | In | Decrypt: split at 32 and 64 |
| SEC-11 | In, differs | The API loads the key (D-263); still returns no SSN |
| SEC-13 | In | Log redaction (D-265) |
| SEC-09 | Later, differs | D-261: the API encrypts, not the browser. Built with the first SSN route |
| SEC-10, BWL-17 Verify | Later | Needs a route and a form |
| BWL-11 | Later | Needs a route |
| BWL-16 (SSN edit) | Later | Needs a route |
| SEC-11a | Already done | D-05 |
| BWL-17 (never shown) | Already done | The Prisma client omits the column |
| Q-22 (who may see SSNs), Q-43 (rotation) | Later | Open questions |

## Decisions used

- D-261: encrypt in the API, never in the browser.
- D-262: the legacy format, exactly; no trim; test vector made by legacy code.
- D-263: `ENCRYPTION_KEY` required, no length minimum, fake key in `.env.example`.
- D-264: one `DecryptionError`, no data in the message.
- D-265: redact `ssn`, `socialSecurityNumber`, `encryptionKey`.
- D-266: `npm run encryption:check` prints counts only.
- D-05: the vendor and desk writes never touch the SSN column. Unchanged.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SEC-09 | The desk encrypts when the SSN box loses focus | The browser sends plaintext over HTTPS; the API encrypts (built later) | D-261 |
| SEC-11 | The API never loads the key | The API loads `ENCRYPTION_KEY` and uses it only through the encryption module | D-263 |

## API

No new route and no change to any response. `ENCRYPTION_KEY` joins the required settings (`config.ts`), so the API does not start without it. `Config` gains `encryptionKey`. The API does **not** build the encryption object in `server.ts` yet: nothing would call it. The first SSN route wires it into `createApp(deps)`.

New module `api/src/shared/encryption/encryption.ts`:

```ts
createEncryption(key: string): Encryption
interface Encryption {
  encrypt(plainText: string | null | undefined): Promise<string>   // '' for null, undefined, ''
  decrypt(cipherText: string | null | undefined): Promise<string>  // '' for null, undefined, ''; rejects with DecryptionError
  valuesMatch(a: string, b: string): Promise<boolean>              // decrypts both
}
class DecryptionError extends Error                       // fixed message, no data
```

- Node's `crypto`: `randomBytes(32)` twice, `await pbkdf2(key, salt, 100_000, 32, 'sha256')`, `createCipheriv('aes-256-cbc', derived, iv.subarray(0, 16))`. Key text goes in as a string (UTF-8, like .NET's `Rfc2898DeriveBytes(string, ...)`).
- **Async, on purpose (owner, 2026-11-13).** The payout report will decrypt 20 to 30 SSNs in one request. `pbkdf2Sync` costs about 12 ms a value here and an estimated 40 to 50 ms on Azure B1, so 30 values would block the event loop for about 1.5 s, and this API runs one instance with live score streams open. The async `crypto.pbkdf2` runs on Node's thread pool and leaves the loop free. A list is decrypted with `Promise.all` (the pool runs four at a time). The check script uses the same functions, one value at a time.
- Decrypt rejects input that is not Base64 or is shorter than 80 bytes (salt, IV, one block) with `DecryptionError`, and wraps any crypto failure in it too.
- .NET twin: `System.Security.Cryptography` (`Aes`, `Rfc2898DeriveBytes`) maps to `node:crypto`.

Script `api/src/db/checkEncryption.ts` (`npm run encryption:check`): reads `DATABASE_URL` and `ENCRYPTION_KEY` (from `.env` or the environment), prints the database with `describeDatabase`, reads every `Bowlers.SocialSecurityNumber` with one raw query (the client omits the column from model reads), and prints counts: `empty`, `nineDigits`, `otherText` (decrypted, not 9 digits), `failed`. Exit code 1 when `failed` or `otherText` is above 0. Never prints a value or an id. The logic lives in `checkEncryptionCore.ts` (takes the encryption object and the values) so tests need no database.

Logger: `redact` in `createLogger` with the censor `[Redacted]` for `ssn`, `socialSecurityNumber`, `encryptionKey`, each at the top level and under `*`.

## Web

None. No screen changes. No mockups.

## Data

No schema change. The column `Bowlers.SocialSecurityNumber` (longtext, `''` when none) is read only by the check script, by raw query.

## Tests

| Rule | Test |
| --- | --- |
| SEC-03, SEC-04, SEC-05, SEC-06, SEC-08, D-262 | `api/src/shared/encryption/encryption.test.ts`: decrypts values made by the legacy `Encryption.cs` (fake key `key` and a long key; a 9-digit value; a value with non-ASCII text; a single space). Fixed vectors in `legacyVectors.ts`. |
| SEC-06 | Same file: a fresh value is Base64 and decodes to 64 bytes plus whole 16-byte blocks; only the first 16 IV bytes matter (change byte 20, still decrypts). |
| SEC-05, SEC-04 | Same file: two encryptions of one value differ, and both decrypt to it. |
| SEC-07 | Same file: `null`, `undefined`, `''` encrypt to `''` and decrypt to `''`; `' '` encrypts to a non-empty value. |
| D-264 | Same file: a wrong key, a damaged value, non-Base64 text, and a too-short value each throw `DecryptionError`; the message holds neither the input nor the key. |
| `valuesMatch` | Same file: same text true, different text false. |
| SEC-11, D-263 | `api/src/config.test.ts`: a missing or empty `ENCRYPTION_KEY` fails; a one-character key passes; the key is not trimmed; `Config` carries it. |
| SEC-13, D-265 | `api/src/shared/logger.test.ts`: `ssn`, `socialSecurityNumber`, `encryptionKey` at the top and one level down log as `[Redacted]`; other fields stay. |
| D-266 | `api/src/db/checkEncryptionCore.test.ts`: counts for empty, nine digits, other text, and failed; output holds no value. `api/src/db/checkEncryption.db.test.ts` (Testcontainers): a row from a legacy vector counts as `nineDigits`; the same rows under a wrong key count as `failed`. |
| Start-up | `api/src/shared/mountRoutes.test.ts` and any test that builds a `Config` gain the key; `npm run check` stays green. |

Then `npm run test:mutation:fast` on the new files; fix survivors.

## Steps

1. Make the legacy vectors with a throwaway .NET project outside the repo (fake key, fake values), and save them as `legacyVectors.ts`.
2. `encryption.ts` and its tests, test first against the vectors.
3. `config.ts` (`ENCRYPTION_KEY`, `Config.encryptionKey`, `loadEncryptionKey` for the script) and tests; add the key to `.env.example`, the PR workflow smoke test, `web/lifecycle/support/stack.ts`, and every test config.
4. Logger redaction and test.
5. `checkEncryptionCore.ts`, `checkEncryption.ts`, the `npm run encryption:check` script, and tests (unit, then Testcontainers).
6. Docs: `docs/security-review-encryption.md`, `docs/requirements/encryption.md`, `docs/api-standards.md` (setting, module, script), `docs/deployment.md` (already set in Azure; how to check it), `.env.example` comments.
7. Lint, typecheck, test, format check in `api/` and `web/` (the lifecycle stack file changed), and mutation.

Each step ends green.

## Security review (`docs/security-review-encryption.md`)

Sections: what we protect and why; the data flow, with where plaintext exists (browser memory, then API memory for one request, never the database, logs, or responses); **why not encrypt in the browser** (D-261); key custody (env var now, Key Vault later, never in git, `VITE_*`, logs, or the web build; who holds a copy: Azure setting, desk app, owner); threats and what covers each (database dump, log leak, wrong key, stolen cookie, an admin with database access, a replayed or edited ciphertext); known limits of the legacy format (no integrity check, the cost of 100,000 rounds a value (async, so it does not block), one key for all rows, no rotation, Q-43); rules for the first SSN route (the payout report, 20 to 30 SSNs: an admin-only permission of its own, an explicit exception to "the API never returns an SSN"; HTTPS only, `signedIn` plus a new permission, never return the value, never log it, rate limit, audit who viewed, Q-22); how the format was proved against legacy; how to run `encryption:check`.

## Not doing

- No SSN route, field, screen, Verify, or 1099 report (`SEC-09`, `SEC-10`, `BWL-11`, `BWL-16`, Q-22).
- No key rotation or rotate script (Q-43).
- No `encryption` dependency in `createApp` yet: no caller, so it would be dead code. The first SSN route adds it.
- No authenticated encryption (a MAC). The desk app shares the column and cannot read a new format. Recorded as a known limit in the review.
- No Key Vault read. The key stays an App Service setting.
