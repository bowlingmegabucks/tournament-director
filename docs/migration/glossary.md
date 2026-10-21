# Glossary

Terms as the legacy app uses them. Code names in brackets.

| Term | Meaning |
| --- | --- |
| **Tournament** | One event, held over one or more days at one bowling center. |
| **Division** | A bracket inside a tournament (for example "Open", "Women/Senior", "Scratch"). Each bowler enters one division per tournament. Divisions set handicap and eligibility. |
| **Squad** [`TournamentSquad`] | A timed qualifying session (for example "Sat 9:00 AM"). Bowlers bowl the tournament's game count. Results decide who advances and who cashes. |
| **Sweeper** [`SweeperSquad`] | A side event with its own entry fee, game count, and prize pool. Stored in the same table as squads. Results do not affect the main tournament. |
| **Super Sweeper** | An extra prize pool for bowlers who enter every sweeper in the tournament and opt in. Ranked on combined sweeper pinfall. |
| **Entry** | One bowler bowling one squad. A bowler who bowls three squads has three entries. Ratios count entries, not bowlers. |
| **Re-entry** | A bowler bowling a second (or later) squad in the same tournament. |
| **Finals ratio** | "1 in N" entries advance to finals. Decimal, for example `8.0` or `7.5`. |
| **Cash ratio** | "1 in N" entries win money. Decimal, same format. |
| **Advancer** | A bowler who qualifies for finals from a squad. |
| **Casher** | A bowler who wins money from a squad but does not advance. |
| **Cut line / cut score** | The score of the last advancer. |
| **Cash line / cash score** | The score of the last casher. |
| **Previous advancer** | A bowler who already advanced from an earlier squad. They cannot advance again; a high score in a later squad earns a cash spot instead. |
| **At-large** | After all squads, extra finals spots for the best non-advancers so the total number of finalists matches the tournament-wide ratio. |
| **Seeding** | The finals order of all finalists in a division, best score first. |
| **Scratch** | Raw pins, no handicap. Also a division with no handicap. |
| **Handicap** | Pins added per game to even out skill: `floor((base − average) × percentage)`, capped. Per division. |
| **Bonus pins** | Sweeper handicap: a flat number of pins per game, set per division per sweeper. |
| **Average** | The bowler's average entered at registration. Drives handicap and average limits. |
| **USBC ID** | United States Bowling Congress member number, format `digits-digits` (for example `1234-56789`). The API uses it to find an existing bowler. |
| **Lane pair** | Two lanes side by side (odd lane, then even lane: 1-2, 3-4). Bowlers share a pair. |
| **Max per pair** | Bowlers per lane pair: 2 to 5. |
| **Position** [`LaneAssignment`] | A bowler's spot on a pair: lane number plus a letter, for example `15A` or `16C`. |
| **Cross** | The lane each bowler moves to for each game, so they bowl on different pairs. Printed on recap sheets. |
| **Skip** | How many pairs a bowler jumps between games in a cross. Grows with the number of lanes. |
| **Recap sheet** | A per-bowler sheet listing lane per game, handicap, and lines for scores and signatures. |
| **No-show** | A bowler registered for a squad who did not bowl. Completing the squad records 0 for each of their games. |
| **Complete** (squad or sweeper) | The session is over. The desk can no longer change lanes or scores on screen, and no new registrations can join it. |
| **Append** | The API path that adds squads, sweepers, or a payment to a bowler who is already registered for the tournament. |
| **Processing system** | The payment system's name, sent by the registration site and stored as a prefix on the confirmation code. |
