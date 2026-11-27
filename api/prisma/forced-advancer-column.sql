-- An admin's ruling that a squad entry advances (NSH-20). A column on the entry, because the flag is
-- a fact about one entry and goes away with it. Run this once on each database (local, production)
-- with any MariaDB client, BEFORE the release that ships it: the API reads the column on every
-- squad. Safe to run again: the column is added only if it is missing. We never run
-- `prisma migrate` (D-30). Tests run this exact file (src/test/forcedAdvancerSchema.ts).

ALTER TABLE `SquadRegistration`
  ADD COLUMN IF NOT EXISTS `ForcedAdvancer` TINYINT(1) NOT NULL DEFAULT 0;
