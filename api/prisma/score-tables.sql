-- The skip pattern of a squad or sweeper (D-235). With `auth-tables.sql`, the only tables we add to
-- the legacy database. Run this once on each database (local, production) with any MariaDB client,
-- before the release that ships it. Safe to run again: the table is created only if it is missing.
-- We never run `prisma migrate` (D-30). WinForms does not know the table and never reads it.
-- Tests run this exact file (src/test/scoreSchema.ts). No row means staggered.

CREATE TABLE IF NOT EXISTS `SessionSkip` (
  `SessionId` CHAR(36)    NOT NULL,
  -- `staggered` or `same` (LAN-19).
  `Skip`      VARCHAR(16) NOT NULL,
  PRIMARY KEY (`SessionId`)
);
