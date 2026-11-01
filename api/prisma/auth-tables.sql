-- Sign-in tables for Better Auth (D-98, D-100). The only tables we add to the legacy database.
-- Run this once on each database (local, production) with any MariaDB client. Safe to run again:
-- every table is created only if it is missing. We never run `prisma migrate` (D-30).
-- Column names and types follow what Better Auth 1.7 expects; the `role` and `ban*` columns come
-- from its admin plugin. Tests run this exact file (src/test/authSchema.ts).

CREATE TABLE IF NOT EXISTS `user` (
  `id`            VARCHAR(36)  NOT NULL,
  `name`          VARCHAR(255) NOT NULL,
  `email`         VARCHAR(255) NOT NULL,
  `emailVerified` TINYINT(1)   NOT NULL DEFAULT 0,
  `image`         TEXT         NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- One of the roles in src/shared/auth/roles.ts (D-97). NULL holds no permissions.
  `role`          VARCHAR(64)  NULL,
  `banned`        TINYINT(1)   NULL DEFAULT 0,
  `banReason`     TEXT         NULL,
  `banExpires`    DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_key` (`email`)
);

CREATE TABLE IF NOT EXISTS `session` (
  `id`             VARCHAR(36)  NOT NULL,
  `expiresAt`      DATETIME(3)  NOT NULL,
  `token`          VARCHAR(255) NOT NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)  NOT NULL,
  `ipAddress`      VARCHAR(64)  NULL,
  `userAgent`      TEXT         NULL,
  `userId`         VARCHAR(36)  NOT NULL,
  `impersonatedBy` VARCHAR(36)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_key` (`token`),
  KEY `session_userId_idx` (`userId`),
  CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `account` (
  `id`                    VARCHAR(36)  NOT NULL,
  `accountId`             VARCHAR(255) NOT NULL,
  -- 'credential' for email and password.
  `providerId`            VARCHAR(64)  NOT NULL,
  `userId`                VARCHAR(36)  NOT NULL,
  `accessToken`           TEXT         NULL,
  `refreshToken`          TEXT         NULL,
  `idToken`               TEXT         NULL,
  `accessTokenExpiresAt`  DATETIME(3)  NULL,
  `refreshTokenExpiresAt` DATETIME(3)  NULL,
  `scope`                 TEXT         NULL,
  -- A salted hash, never the password.
  `password`              TEXT         NULL,
  `createdAt`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`             DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_userId_idx` (`userId`),
  CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
);

-- Password reset and invite tokens. Stage 3 uses it; it is created now so this script runs once.
CREATE TABLE IF NOT EXISTS `verification` (
  `id`         VARCHAR(36)  NOT NULL,
  `identifier` VARCHAR(255) NOT NULL,
  `value`      TEXT         NOT NULL,
  `expiresAt`  DATETIME(3)  NOT NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `verification_identifier_idx` (`identifier`)
);
