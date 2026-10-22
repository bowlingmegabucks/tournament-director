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
]
