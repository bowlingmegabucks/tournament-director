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
]
