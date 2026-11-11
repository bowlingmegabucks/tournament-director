-- The skip pattern (D-235) and the DNF flags (D-248) of squads and sweepers. With `auth-tables.sql`, the only tables we add to
-- the legacy database. Run this once on each database (local, production) with any MariaDB client,
-- before the release that ships it. Safe to run again: the table is created only if it is missing.
-- We never run `prisma migrate` (D-30). WinForms does not know the table and never reads it.
-- Tests run this exact file (src/test/scoreSchema.ts). No skip row means staggered; no DNF row means not flagged.

CREATE TABLE IF NOT EXISTS `SessionSkip` (
  -- The `Id` of a row in `Squads`, which holds squads and sweepers alike. No foreign key: WinForms owns that table.
  `SessionId` CHAR(36)    NOT NULL,
  -- `staggered` or `same` (LAN-19).
  `Skip`      VARCHAR(16) NOT NULL,
  PRIMARY KEY (`SessionId`)
);

-- A bowler flagged "did not finish" in an open squad or sweeper (D-248): the full-game count leaves
-- them out. A saved score for the bowler deletes the row (D-250). No foreign keys, as above.
CREATE TABLE IF NOT EXISTS `SessionDnf` (
  -- The `Id` of a row in `Squads`.
  `SessionId`      CHAR(36) NOT NULL,
  -- The `Id` of a row in `Registrations`.
  `RegistrationId` CHAR(36) NOT NULL,
  PRIMARY KEY (`SessionId`, `RegistrationId`)
);
