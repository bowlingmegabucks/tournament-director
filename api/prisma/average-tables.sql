-- The average checks of a tournament (D-287): one row for each registration a director verified or
-- adjusted. With `auth-tables.sql`, `score-tables.sql`, and `payout-tables.sql`, the only tables we add to
-- the legacy database. Run this once on each database (local, production) with any MariaDB client,
-- before the release that ships it. Safe to run again: the table is created only if it is missing.
-- We never run `prisma migrate` (D-30). WinForms does not know the table and never reads it. No
-- foreign key: WinForms owns the table this one points at, and our delete routes remove the row.
-- Tests run this exact file (src/test/averageSchema.ts).

CREATE TABLE IF NOT EXISTS `AverageVerifications` (
  -- The `Id` of a row in `Registrations`.
  `RegistrationId`  CHAR(36)     NOT NULL,
  -- The registration's average when the director checked it. NULL when the bowler gave none.
  `ProvidedAverage` INT          NULL,
  -- The average handicap uses (D-288). Whole, 1 to 300; the API checks (AVG-04).
  `VerifiedAverage` INT          NOT NULL,
  -- Why it was adjusted, or where the number came from. NULL means the provided average was verified.
  `Note`            VARCHAR(500) NULL,
  -- A user id (`user`.`id`).
  `VerifiedBy`      VARCHAR(36)  NOT NULL,
  `VerifiedAt`      DATETIME(3)  NOT NULL,
  PRIMARY KEY (`RegistrationId`)
);
