-- The payouts of a tournament (D-267, D-281): what each squad, sweeper, the super sweeper, and the
-- finals paid one bowler. With `auth-tables.sql` and `score-tables.sql`, the only tables we add to the
-- legacy database. Run this once on each database (local, production) with any MariaDB client,
-- before the release that ships it. Safe to run again: the table is created only if it is missing.
-- We never run `prisma migrate` (D-30). WinForms does not know the table and never reads it. No
-- foreign keys: WinForms owns the tables this one points at. Tests run this exact file
-- (src/test/payoutSchema.ts).

CREATE TABLE IF NOT EXISTS `Payouts` (
  `Id`             CHAR(36)     NOT NULL,
  -- The `Id` of a row in `Tournaments`. `Registrations` has no tournament column (Q-26), so it is kept here.
  `TournamentId`   CHAR(36)     NOT NULL,
  -- `squad`, `sweeper`, `superSweeper`, or `finals`.
  `Source`         VARCHAR(16)  NOT NULL,
  -- A squad or sweeper: the `Id` in `Squads`. Finals: the `Id` of the division. Super sweeper: the tournament id.
  `EventId`        CHAR(36)     NOT NULL,
  -- The `Id` of a row in `Registrations`.
  `RegistrationId` CHAR(36)     NOT NULL,
  -- Dollars with cents. Above 0 and at most 99999.99; the API checks (PAY-07).
  `Amount`         DECIMAL(7,2) NOT NULL,
  `Note`           VARCHAR(200) NULL,
  `Paid`           TINYINT(1)   NOT NULL DEFAULT 0,
  `CreatedAt`      DATETIME(3)  NOT NULL,
  -- A user id (`user`.`id`).
  `CreatedBy`      VARCHAR(36)  NOT NULL,
  `UpdatedAt`      DATETIME(3)  NOT NULL,
  `UpdatedBy`      VARCHAR(36)  NOT NULL,
  PRIMARY KEY (`Id`),
  -- A payee has at most one payout in one event (D-267).
  UNIQUE KEY `UX_Payouts_Event_Registration` (`Source`, `EventId`, `RegistrationId`),
  KEY `IX_Payouts_Tournament` (`TournamentId`)
);
