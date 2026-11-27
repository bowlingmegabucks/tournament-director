-- A youth bowler's winnings go to their SMART account (SMT-01). A column on the registration, not the
-- bowler, so a bowler who ages out does not change what an earlier year reports. Run this once on
-- each database (local, production) with any MariaDB client, BEFORE the release that ships it: the
-- API reads the column on every registration. Safe to run again: the column is added only if it is
-- missing. We never run `prisma migrate` (D-30). Tests run this exact file
-- (src/test/smartScholarshipSchema.ts).

ALTER TABLE `Registrations`
  ADD COLUMN IF NOT EXISTS `SmartScholarship` TINYINT(1) NOT NULL DEFAULT 0;
