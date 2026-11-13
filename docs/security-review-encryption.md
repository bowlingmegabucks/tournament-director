# Security review: SSN encryption

Written 2026-11-13 for the encryption slice (branch `encryption`). Rules: `SEC-03` to `SEC-11` and `SEC-13` in [migration/security.md](migration/security.md); decisions D-261 to D-266; requirements in [requirements/encryption.md](requirements/encryption.md).

Review again before the first route or screen that handles an SSN, and before any change to the key or the format.

## What we protect

The `Bowlers.SocialSecurityNumber` column holds a bowler's SSN, encrypted by the legacy WinForms desk app. Today this app never reads or writes it: the Prisma client leaves the column out of every model read (`BWL-17`), and no write names it (D-05). This slice adds the means to encrypt and decrypt, so a later feature can use it. The first planned use is a payout report of bowlers who won more than a set amount (a 1099 list), about 20 to 30 people.

An SSN is the data in this system that does the most harm if it leaks. The rest of this review serves that one fact.

## The format (match legacy exactly)

AES-256-CBC with PKCS7 padding. The key comes from PBKDF2-SHA256 over the `ENCRYPTION_KEY` text, a random 32-byte salt per value, and 100,000 rounds. A random 32-byte IV is stored, and the first 16 bytes serve as the IV. The stored text is Base64 of salt, IV, and ciphertext. Empty text is stored as `''` (`SEC-03` to `SEC-08`, D-262).

Proof that Node and legacy agree, in both directions (2026-11-13):

- Four values made by the real legacy `Encryption.cs` (fake key, fake text, including non-ASCII text, a single space, and a long key with symbols) decrypt in Node. They live in `api/src/shared/encryption/legacyVectors.ts` and run in `encryption.test.ts`.
- Three values made by the Node code decrypt with the real legacy `Decrypt` (checked once by hand in a throwaway .NET console project; not in CI, because CI has no .NET).
- To make more vectors: copy `Encryption.cs` from the `tournament-manager` repo into a console project, set `Encryption.Key`, and print `"text".Encrypt()`. Use a fake key and fake text. Never commit a real SSN or key.

## Where plaintext lives

| Place                 | Holds plaintext?                                | Notes                                                                                           |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Browser               | Yes, while the desk types it                    | The browser sends it over HTTPS. It is not stored (no `localStorage`, no query string, no URL). |
| The wire              | No                                              | TLS only. The API is served over HTTPS (Azure forces it).                                       |
| API memory            | Yes, for one request                            | Between decrypt and the response, or between the request and the encrypt.                       |
| Database              | No                                              | Only the Base64 ciphertext, as legacy stores it.                                                |
| Logs, traces, metrics | **Never**                                       | Redaction (D-265) is the backstop; the first rule is not to log a value.                        |
| API responses         | **Never**, except the one reviewed report below | The model reads omit the column.                                                                |
| Backups               | Ciphertext only                                 | The key is not in the database or its backups.                                                  |

## Why the browser does not encrypt (D-261)

The question was whether the page should encrypt an SSN before it sends it.

- **The key is symmetric.** Whoever can encrypt can also decrypt. To encrypt in the browser, the browser needs the key. Anything the browser holds goes to every visitor (`VITE_*` ships in the public build, and `check:dist` already guards the web build for secrets). So the key would leak, and every stored SSN with it.
- **A derived or wrapped key does not help.** Whatever the page holds is enough to decrypt. Asymmetric encryption in the page would hide the value from the wire, but TLS already does that, and it adds a key pair to run for no gain here.
- **The wire is already safe.** HTTPS encrypts the request. An attacker who can read TLS traffic can also steal the sign-in cookie, and encrypting the body would not stop that.
- **The API must see the plaintext anyway.** It validates the SSN (`BWL-11`: exactly 9 digits), compares it (`SEC-10`), and encrypts it. Doing that in the browser would move the checks to a place an attacker controls.

So: plaintext goes to the API over HTTPS; the API validates, encrypts, and writes. The API holds the only copy of the key that this app uses. This replaces `SEC-09`, where the desk app encrypted when the field lost focus.

What the browser must still do when the SSN screen exists: an `autocomplete="off"` password-style input that does not echo, no value in the URL or storage, no value in any error message, and clearing the field after a save.

## Key custody (D-263)

- The key is the legacy `EncryptionKey` text, unchanged, so existing values open.
- **Production:** the App Service setting `ENCRYPTION_KEY`. The desk app reads the same text from Key Vault (`encryption-key`). Moving the API to read Key Vault is later work and changes nothing in the code that uses `Config`.
- **Local and tests:** a fake value in `api/.env.example` and test factories. It protects nothing.
- It is never in git, `VITE_*`, a log, an error message, a response, or telemetry. `config.ts` is the only place that reads it, and the config tests check that a rejected setting does not print it.
- Who holds a copy: the Azure setting, Key Vault, and the desk app's machines. Treat a copy found anywhere else as a leak.
- The key is used exactly as given (no trim, any length), because a changed key cannot read what the desk app wrote.

## Threats

| Threat                                      | What covers it                                                                                                                                   | What does not                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Database dump or backup leaves the building | Every value is encrypted with a per-value salt and IV; the key is not in the database                                                            | Anyone who also has the key                                                                                             |
| A log or telemetry line carries an SSN      | Redaction of `ssn`, `socialSecurityNumber`, `encryptionKey` (top level and one level down); the request logger writes ids, not bodies (`SEC-13`) | A deeper field, or a value inside a message string. The rule is to log counts and ids only                              |
| A response returns an SSN by accident       | The Prisma client omits the column; a route that returns one is an explicit, reviewed exception                                                  | Nothing technical stops a new query that selects the column. Review catches it                                          |
| Wrong key (a typo or a changed setting)     | `DecryptionError`, a start-up refusal when the key is missing, and `npm run encryption:check`                                                    | A wrong key passes the padding check about 1 time in 256 and returns garbage, so a caller checks for 9 digits (D-264)   |
| Someone edits a stored value                | Nothing: CBC with no MAC does not detect it. A changed value usually fails padding, but not always                                               | An attacker with write access to the table. Legacy has the same limit (see below)                                       |
| Stolen sign-in cookie                       | Sign-in rules, 12-hour sessions, `httpOnly` (D-98)                                                                                               | A thief holding a valid session sees what the session may see. This is why the first SSN route needs its own permission |
| An admin with database access               | Nothing: such a person can also read the app's settings                                                                                          | Audit of who viewed an SSN (a proposed feature, Q-22) would record it after the fact                                    |
| Slow key work stalls the API                | The module uses the async `pbkdf2`, on the thread pool                                                                                           | The pool runs four at a time: 30 values take about eight rounds of work, around half a second on a small instance       |

## Known limits of the legacy format

We keep these on purpose, so the desk app and the new app read each other's values (D-262). Each is recorded so nobody learns of it late.

- **No integrity check.** CBC with no MAC cannot tell a changed value from a good one. A tamper test is out of scope. Moving to an authenticated mode (AES-GCM) would mean a new format with a version marker and a re-encrypt of every row, and the desk app could not read it.
- **One key for every value.** The key decrypts everything. A leak is total.
- **No rotation** (Q-43). A new key leaves every stored value unreadable until each is re-encrypted, and the desk app shares the key, so both change together. Do not change `ENCRYPTION_KEY` while any SSN is stored.
- **100,000 PBKDF2 rounds a value** is the legacy cost. It makes each decrypt cost real time (about 12 ms here, an estimated 40 to 50 ms on Azure B1). It is a slow lock on a guessable key, not a reason to choose a weak key: use a long random key.
- **The key text is a password, not a key.** A guessable `EncryptionKey` can be guessed offline against any stored value. Check that the production key is long and random. (A rotation would be the moment to fix a weak one.)

## Rules for the first route that handles an SSN

The payout report (about 20 to 30 SSNs) will be the first. It is an explicit exception to "the API never returns an SSN", so it needs its own review.

1. **Its own permission**, held only by the admin at first (D-96, D-132 style), not `registrations.read`. The API key must not reach it.
2. **HTTPS only**, over a signed-in session. No SSN in a query string or a path.
3. **Return the minimum**: the report returns what a 1099 needs, for bowlers over the threshold only. Never a full bowler list with SSNs.
4. **Decrypt only on the report**, and only the rows the report names. Use `Promise.all`; the async module keeps the loop free.
5. **Check each result is 9 digits**; a row that is not goes in the report as an error, with the bowler id and no text.
6. **Never log** a value, a count of digits, or a partial. Log who ran the report, how many rows, and when (the user id, a count). Ids only.
7. **Send `Cache-Control: no-store`** and no ETag. The report must not sit in a browser or proxy cache.
8. **Rate limit it**, and record it. An audit log of who read an SSN (Q-22, proposed features) belongs with this route, not after it.
9. **The web page does not keep it**: no query cache beyond the view, no `localStorage`, a download over a short-lived request, and no SSN in the URL or the file name.
10. **A write route** (add or edit an SSN) validates 9 digits at the API (`BWL-11`), encrypts there (D-261), stores the ciphertext, and returns nothing that holds the SSN. A blank box means "no change", not "clear" (BWL-16, D-206 sets the desk's rule for other fields).
11. Settle Q-22 (who may see SSNs) before building.

## How to check the key against real data

Set `DATABASE_URL` and `ENCRYPTION_KEY` to the real values in your shell, then run `npm run encryption:check` in `api/`. It prints counts only: how many bowlers, how many have no SSN, how many decrypt to 9 digits, how many decrypt to other text, and how many fail. It never prints a value or an id. Run it once when you first point the API at real data, and after any change to the key setting. A non-zero "other text" or "could not decrypt" means the key does not match what the desk app used, or some rows are damaged. Fix the key first.

## Open items

- Q-22: who may see SSNs, and whether the 1099 report ships (the payout feature).
- Q-43: key rotation.
- A MAC or an authenticated format: not planned, because the desk app shares the column.
- Key Vault for the API: later; the setting stays the contract.
