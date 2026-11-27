-- Lane pairs a director took out of play for one squad or sweeper (OOP-01): one row per pair, by its
-- first lane. No row means the pair is in play. Run this once on each database (local, production)
-- with any MariaDB client, before the release that ships it. Safe to run again: the table is created
-- only if it is missing. We never run `prisma migrate` (D-314). No foreign key: our delete routes
-- remove the rows. Tests run this exact file (src/test/laneSchema.ts).

CREATE TABLE IF NOT EXISTS `LanesOutOfPlay` (
  -- The `Id` of a row in `Squads` (a squad or a sweeper).
  `SquadId` CHAR(36) NOT NULL,
  -- The first lane of the pair: 1 for lanes 1-2.
  `Lane`    SMALLINT NOT NULL,
  PRIMARY KEY (`SquadId`, `Lane`)
);
