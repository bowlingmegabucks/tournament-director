# Security and secrets

Source: `business logic/Encryption.cs`, `main/Program.cs`, `main/Controls/SocialSecurityNumberControl.cs`, `main/Dialogs/ConfirmSensitiveInfoDialog.cs`, `api/Authentication/ApiKeyAuthentication.cs`, `infrastructure/main.tf`.

## Who can do what

| ID | Rule |
| --- | --- |
| SEC-01 | **No user accounts.** Anyone who can run the desk app has full access. The desk app connects straight to the database with a connection string. |
| SEC-02 | The API has one shared key for the registration site (`x-api-key`). No per-user identity. |

The old spec's roles (director, staff, viewer) and JWT login are new ideas, not legacy. The new app's plan: one API key (D-95), then permission-based access with score keeper, director, and admin roles (D-94, D-96, D-97), with Better Auth for sign-in (D-98 to D-101). See [proposed-features.md](proposed-features.md).

## SSN encryption

The new app must read SSNs that legacy wrote, so match this format exactly.

| ID | Rule |
| --- | --- |
| SEC-03 | **Algorithm:** AES-256 in **CBC** mode, PKCS7 padding, 128-bit block. (Not GCM. The old `rewrite/` docs were wrong.) |
| SEC-04 | **Key:** derived per value with PBKDF2: password = the `EncryptionKey` config value (Key Vault secret `encryption-key`), salt = 32 random bytes, 100,000 iterations, HMAC-SHA256, 32-byte output. |
| SEC-05 | **IV:** 32 random bytes are generated and stored, but only the **first 16** are used as the IV. |
| SEC-06 | **Stored value:** Base64 of `salt (32 bytes) ‖ iv (32 bytes) ‖ ciphertext`. |
| SEC-07 | Empty or missing plaintext encrypts to `''`. `''` decrypts to `''`. |
| SEC-08 | Decrypt: Base64-decode, split at 32 and 64, derive the key from the salt, decrypt with the first 16 IV bytes. |
| SEC-09 | The desk encrypts as soon as the SSN field loses focus. Plaintext is not kept. |
| SEC-10 | The SSN is never shown. "Verify" asks the user to retype it, then compares decrypted values (`BWL-17`). |
| SEC-11 | The API neither accepts nor returns SSNs, and it never loads the encryption key. (Its health check only confirms the secret exists.) |
| SEC-11a | **Defect:** a registration from the API for a returning bowler erases that bowler's stored SSN (`REG-07`). |

Node can do all of this with the built-in `crypto` module (`pbkdf2Sync` with `'sha256'`, `createDecipheriv('aes-256-cbc', key, iv.subarray(0, 16))`). Write a test using a value encrypted by legacy before relying on it.

## Secrets and config

| Secret | Legacy source | Used by |
| --- | --- | --- |
| Database connection string | Key Vault `bowlingm-nec-tournament-db-connection-string`; config `ConnectionStrings:Default` | Desk app, API |
| Encryption key | Key Vault `encryption-key`; config `EncryptionKey` | Desk app only |
| API key | Key Vault `api-key`; config `Authentication:ApiKey` | API |
| Key Vault access (desk) | `KeyVaultConfig:VaultUrl`, `Authentication:TenantId`, `ClientId`, `ClientSecret` in the desk app's `appsettings.json` | Desk app, release builds |

Key Vaults: `kv-megabucks-<env>` (shared) and `kv-megabks-trn-mgr-<env>` (app). Resource group `rg-trn-mgr-<env>`.

## Other

| ID | Rule |
| --- | --- |
| SEC-12 | Debug builds log SQL with parameter values (EF `EnableSensitiveDataLogging`). Release builds do not. |
| SEC-13 | The API logs whole request and command objects (Serilog `{@Request}`), which include names, addresses, and payment codes. Avoid this in the new API. |
| SEC-14 | Slow queries over 250 ms are logged (`QueryPerformance:SlowQueryThresholdMilliseconds`). |
