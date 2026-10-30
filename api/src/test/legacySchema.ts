/**
 * The legacy tables the tests need, copied from docs/migration/database.md.
 * Add a table here when a feature starts reading it.
 */
export const legacySchemaSql = [
  `CREATE TABLE \`Tournaments\` (
    \`Id\`                   char(36)     NOT NULL,
    \`Name\`                 longtext     NOT NULL,
    \`Start\`                datetime(6)  NOT NULL,
    \`End\`                  datetime(6)  NOT NULL,
    \`EntryFee\`             decimal(5,2) NOT NULL,
    \`Games\`                smallint     NOT NULL,
    \`FinalsRatio\`          decimal(3,1) NOT NULL,
    \`CashRatio\`            decimal(3,1) NOT NULL,
    \`BowlingCenter\`        longtext     NOT NULL,
    \`Completed\`            tinyint(1)   NOT NULL,
    \`SuperSweperCashRatio\` decimal(3,1) NOT NULL DEFAULT 0.0,
    PRIMARY KEY (\`Id\`)
  )`,
  `CREATE TABLE \`Divisions\` (
    \`Id\`                     char(36)     NOT NULL,
    \`Name\`                   longtext     NOT NULL,
    \`Number\`                 smallint     NOT NULL,
    \`TournamentId\`           char(36)     NOT NULL,
    \`MinimumAge\`             smallint     NULL,
    \`MaximumAge\`             smallint     NULL,
    \`MinimumAverage\`         int          NULL,
    \`MaximumAverage\`         int          NULL,
    \`HandicapPercentage\`     decimal(3,2) NULL,
    \`HandicapBase\`           int          NULL,
    \`MaximumHandicapPerGame\` int          NULL,
    \`Gender\`                 int          NULL,
    PRIMARY KEY (\`Id\`),
    FOREIGN KEY (\`TournamentId\`) REFERENCES \`Tournaments\` (\`Id\`) ON DELETE CASCADE
  )`,
  `CREATE TABLE \`Squads\` (
    \`Id\`              char(36)     NOT NULL,
    \`TournamentId\`    char(36)     NOT NULL,
    \`SquadType\`       int          NOT NULL,
    \`Date\`            datetime(6)  NOT NULL,
    \`CashRatio\`       decimal(3,1) NULL,
    \`MaxPerPair\`      smallint     NOT NULL,
    \`StartingLane\`    smallint     NOT NULL DEFAULT 0,
    \`NumberOfLanes\`   smallint     NOT NULL DEFAULT 0,
    \`Complete\`        tinyint(1)   NOT NULL,
    \`FinalsRatio\`     decimal(3,1) NULL,
    \`SquadEntryFee\`   decimal(5,2) NULL,
    \`SweeperEntryFee\` decimal(5,2) NULL,
    \`Games\`           smallint     NULL,
    PRIMARY KEY (\`Id\`),
    FOREIGN KEY (\`TournamentId\`) REFERENCES \`Tournaments\` (\`Id\`) ON DELETE CASCADE
  )`,
  `CREATE TABLE \`SweeperDivision\` (
    \`SweeperId\`        char(36) NOT NULL,
    \`DivisionId\`       char(36) NOT NULL,
    \`BonusPinsPerGame\` int      NULL,
    PRIMARY KEY (\`SweeperId\`, \`DivisionId\`),
    FOREIGN KEY (\`DivisionId\`) REFERENCES \`Divisions\` (\`Id\`) ON DELETE CASCADE,
    FOREIGN KEY (\`SweeperId\`)  REFERENCES \`Squads\` (\`Id\`)    ON DELETE CASCADE
  )`,
  `CREATE TABLE \`Bowlers\` (
    \`Id\`                   char(36)    NOT NULL,
    \`FirstName\`            longtext    NOT NULL,
    \`MiddleInitial\`        char(1)     NOT NULL DEFAULT '',
    \`LastName\`             longtext    NOT NULL,
    \`Suffix\`               longtext    NOT NULL,
    \`StreetAddress\`        longtext    NOT NULL,
    \`CityAddress\`          longtext    NOT NULL,
    \`StateAddress\`         char(2)     NOT NULL,
    \`ZipCode\`              char(9)     NOT NULL,
    \`EmailAddress\`         longtext    NOT NULL,
    \`PhoneNumber\`          char(10)    NOT NULL,
    \`USBCId\`               longtext    NOT NULL,
    \`DateOfBirth\`          datetime(6) NULL,
    \`Gender\`               int         NULL,
    \`SocialSecurityNumber\` longtext    NOT NULL,
    PRIMARY KEY (\`Id\`)
  )`,
  `CREATE TABLE \`Registrations\` (
    \`Id\`           char(36)   NOT NULL,
    \`BowlerId\`     char(36)   NOT NULL,
    \`DivisionId\`   char(36)   NOT NULL,
    \`Average\`      int        NULL,
    \`SuperSweeper\` tinyint(1) NOT NULL,
    PRIMARY KEY (\`Id\`),
    FOREIGN KEY (\`BowlerId\`)   REFERENCES \`Bowlers\` (\`Id\`),
    FOREIGN KEY (\`DivisionId\`) REFERENCES \`Divisions\` (\`Id\`)
  )`,
  `CREATE TABLE \`SquadScores\` (
    \`BowlerId\` char(36) NOT NULL,
    \`SquadId\`  char(36) NOT NULL,
    \`Game\`     smallint NOT NULL,
    \`Score\`    int      NOT NULL,
    PRIMARY KEY (\`BowlerId\`, \`SquadId\`, \`Game\`),
    FOREIGN KEY (\`BowlerId\`) REFERENCES \`Bowlers\` (\`Id\`),
    FOREIGN KEY (\`SquadId\`)  REFERENCES \`Squads\` (\`Id\`)
  )`,
  `CREATE TABLE \`SquadRegistration\` (
    \`RegistrationId\` char(36)   NOT NULL,
    \`SquadId\`        char(36)   NOT NULL,
    \`LaneAssignment\` varchar(3) NOT NULL DEFAULT '',
    PRIMARY KEY (\`RegistrationId\`, \`SquadId\`),
    FOREIGN KEY (\`RegistrationId\`) REFERENCES \`Registrations\` (\`Id\`),
    FOREIGN KEY (\`SquadId\`)        REFERENCES \`Squads\` (\`Id\`)
  )`,
]
