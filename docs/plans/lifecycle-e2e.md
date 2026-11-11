# Tournament lifecycle test (1.0.0 prep)

An outline and rules for one UI-driven Playwright test that runs a whole tournament, from an empty list to complete results. We build it in the 1.0.0 milestone, one stage at a time, as the features it needs land. This file is a plan, not a design: details wait for the build.

**Keep this plan current.** Every pull request prep checks it (see `pull-request-prep`, Docs). A branch that adds or changes a feature a stage uses updates the stage, the scripted failures, or the expected numbers here.

## Why

The other suites check one screen or route at a time, on mocks or small data. They cannot show that create, register, assign, score, and result agree on a tournament of real size. The risk is in that agreement: counts, ranking, handicap, ties, cashers, money.

## Status

Built so far (branch `results`, 1.0.0-rc.1): the harness, stages 0 to 3, stage 4 (the site's 90 and the desk's 60, in batches), and lanes, scores, and complete for the four squads (stages 5 to 7, squad part), in `web/lifecycle/`. Run `npm run test:lifecycle` in `web/` (needs Docker and `python3`).

- **Stack.** `web/lifecycle/docker-compose.yml` (its own MariaDB on 15406 and Mailpit on 15425, no volume), the API on 3100 (empty tables from `npm run db:tables` in `api/`), and the production web build (`dist-lifecycle`, sign-in on, `check:dist` run on it) on 4273. `globalTeardown` removes the containers; `LIFECYCLE_KEEP=1` keeps them.
- **Stage 0 so far.** First admin from `users:create-admin` through a pseudo-terminal (`support/answerPrompts.py`, because the script refuses piped input), then director and score keeper through the add-user page, invites read from Mailpit, passwords set, sign-in with the real login page. **Not yet:** the earlier tournament and its 50 returning bowlers.
- **Stage 1.** Create, edit the bowling center, check the overview and the list.
- **Rule 9 gap.** "No live cache" needs a setting: `LIVE_CACHE_MS` is a constant in `ttlCache.ts`. Add an env var before stage 7.
- **Stage 2.** Three divisions (scratch, 90% of 220 handicap, Women or Seniors with averages 100 to 180), the list and numbering, and the used-name 409.
- **Stage 3.** Four squads (38 lanes edited to 40, 48 lanes with a $75 fee, 40 lanes with a 1 in 5 cash ratio, 40 lanes), two sweepers (one with bonus pins for Women or Seniors, one edited from $25 to $30), a spare of each deleted, and the squad-outside-the-dates 409. The two scripted failures that need entries or lane saves wait for stages 4 and 5.
- **Dates.** The tournaments sit in March 2025 and September 2024 (fixed, in the past) because bowlers need real birth dates; a 2099 tournament made 2079 births.
- **Stage 0, earlier tournament.** "Autumn Warmup" (one division, one squad, $50) made in the UI; the 50 returning bowlers (numbers 0 to 49 of `data/bowlers.json`) registered through the vendor routes with the API key. The page shows 50 bowlers registered.
- **Stage 4, site part.** Bowlers 0 to 89 (60% of 150, 50 of them returning) register in the main tournament through `POST /v1/registrations`: two squads each by number modulo 4 (45 in each squad), sweeper one for every third (30), sweeper two for every second (45), super sweeper for 0, 6, and 12, a Stripe payment of the hand-worked fee. The Registrations page summary must show 90 bowlers, 3 in the super sweeper, and those counts. Rules for who enters what are in `data/registrationPlan.ts`.
- **Bowler data.** `data/bowlers.json` (150 bowlers) is made once by `node lifecycle/data/generateBowlers.ts` and committed; the run never calls faker (rule 4).
- **Stage 4, desk part.** The desk's 60 new bowlers (numbers 90 to 149), typed in full through Add registration, in four batches of 15, one before each squad. Batch 0 enters A plus B, C, or D; batch 1 enters B plus C or D; batch 2 enters C and D; batch 3 enters D only. Sweepers by the same rules as the site (every third and every second bowler), super sweeper for bowlers 90 and 96. Each Review step is checked against the hand-worked "Total to collect". After all four: 150 bowlers, 5 in the super sweeper, squads A 60, B 65, C 73, D 87 (285 entries), sweeper one 50 and two 75. Squad C has 40 lanes so its 73 entries fit.
- **Women or Seniors.** The division is the legacy "Women or Seniors" (female, minimum age 50): a woman of any age, or anyone 50 and up, who averages 100 to 180 may enter (REG-04e). My first version was named "Senior Women" and the scripted failure used a 57-year-old man, which is allowed; the failure now uses a man under 50.
- **Squad loop (stages 5 to 7).** After each batch: every bowler is put on a pair through the Assign dialog (round robin, so no pair passes its maximum and no one is left unassigned), all six games are typed through the pair sheets (about 1,700 scores, each waited on until its row says Saved), the Scores tab shows one site bowler's six games, and the squad is completed ("All have scores, so no zeros are saved"). Scores come from a fixed rule (`data/scores.ts`: average minus 20 plus a swing of 0 to 60 by bowler number and game), except 11 designed lines of six fixed games for chosen bowlers (`designedScores`, keyed by squad letter and bowler number). They give: a tie on total at the cut line decided on high game (A Scratch), a full tie across the cash line (A Scratch), a full tie across the cut line (A Women or Seniors), a tie across the cash line decided on the 2nd-highest game (B Scratch), a handicap that puts the lowest scratch first (A Handicap, N = 3, no advancer), and an earlier advancer (bowler 0 in C Women or Seniors). After each squad completes, the test checks its Results tab against `data/expectedResults.ts` (rows to the cash line, Cut Line and Cash Line rows, tie notes); B Handicap is checked with no designed lines. Squad D's results are not checked yet: its earlier advancers come from A, B, and C, so its table needs a longer hand-worked list. A no-show, a walk-off, and a score edit are not built. The run takes about 3.7 minutes.
- **Open finding.** Once, a box on a pair sheet came up empty after its fill (a live update seemed to redraw the sheet), and the box was typed again. The helper now retries up to three times. Worth a look in the app: the sheet is meant to keep what the keeper typed.
- **Not built yet:** the added squads and sweepers for site bowlers (15 squad and about 25 sweeper entries), the edits and deletes of the stage-4 list, the money checks beyond the Review totals, and the scripted failures that need entries. The sweepers' lanes, scores, and complete. The results checks (stage 7), complete tournament, and access.

## Rules

1. **One real stack, no shortcuts.** A fresh database, the real API, and the production web build, with no mocks. Nothing writes to the database directly: every row comes from the app (the UI, the registration site's API routes, or the app's own scripts). Loading the empty schema is setup, not data.
2. **The test plays the tournament director.** It signs in as the director and does the job: sets up the tournament, takes registrations and payments at the desk, assigns lanes, prints recap sheets, and (once it exists) keeps scores and completes sessions. The admin signs in only for what the director cannot do (delete a tournament). The score keeper and a signed-out visitor appear only in the access stage.
3. **UI first.** Every director action goes through the screens. The registration site is the exception: its registrations go through the vendor routes with the API key, as in real life.
4. **Fixed where it matters, random where it does not.** Factories follow the `neba-website` `Neba.TestFactory` pattern: a `Create(overrides)` with valid defaults, and a `Bogus(count, faker)` for the rest. Gender, age, average, division, squad choices, and every score are fixed. Name, address, phone, and email are random from `@faker-js/faker` with a fixed seed, written once to a committed fixture so a library upgrade cannot change the data.
5. **Expected results come from outside the code.** Write the rankings, totals, handicaps, cash lines, counts, and fees by hand (or from the WinForms output for the same data), never from the app's own logic. Matching WinForms once on this data also ticks the open "compare with WinForms output" item in [v1-requirements.md](../v1-requirements.md).
6. **Assert at every step.** Each stage checks what it made, in the UI and, where the UI hides a number, in one API read.
7. **Failures are scripted, not random.** Each sits at a fixed point, asserts one known error, and checks that nothing changed.
8. **Stages run in order.** A failed stage skips the later ones, which need its data.
9. **Test settings.** No live cache, a rate limit the run never meets, the real login page (not the dev quick-login buttons), and the web app and API on separate ports with CORS, like production. The production build hides sign-in, so build it with `VITE_SHOW_SIGN_IN=true` and `VITE_API_BASE_URL` set to the test API, and check that `npm run check:dist` still passes with the flag on.
10. **Evidence.** Traces, screenshots, video, and the report are kept when a run fails.

## Data

| Item            | Count | Notes                                                                                 |
| --------------- | ----- | ------------------------------------------------------------------------------------- |
| Tournament      | 1     | Made in the UI, with fixed dates.                                                     |
| Divisions       | 3     | One scratch, one handicap with a percent, one limited by gender or age with averages. |
| Squads          | 4     | Different sizes; one with its own fee, one with its own ratio.                        |
| Sweepers        | 2     | One with bonus pins, one without. Three bowlers in the super sweeper.                 |
| Squad entries   | 300   | 285 from registrations (site 180, desk 105) plus 15 added at the desk by site bowlers. |
| Sweeper entries | 150   |                                                                                       |
| Bowlers         | 150   | 50 returning, 100 new (40 through the site, 60 at the desk). Last year: 260 bowlers, about 760 entries (2.9 each).         |

The 50 returning bowlers come from an earlier, smaller tournament that the test registers first through the vendor routes, so they exist the way real ones do (D-05). Entries split between the desk (UI), the registration site (API key), and the returning bowlers.

The score set is designed: ties for first and at the cash line (scratch and handicap), a handicap that changes the order, a no-show and a did-not-finish, a missed sweeper (D-90), bonus pins that move a result, a bowler in two squads (best single entry, RES-19), and a score edit after entry.

## Stages

**The tournament runs in time order, not stage by stage (owner, 2026-11-11).** Desk registrations are spread across the squads as they are in life. Before a squad, walk-ins register for it (and for later sessions); then its lanes are assigned, its scores are entered, and it is completed; only then does the next batch of walk-ins register, some of them for squads still ahead. The chronological order is squad A (Wed 9:00), B (Wed 1:00), C (Thu 9:00), D (Thu 1:00), sweeper one (Thu 6:00), sweeper two (Fri 11:00). Stages 4 to 7 below are the steps of that loop, not four separate passes: the site registers first (before anything), then for each session in order: desk batch, lanes, scores, complete. A later batch cannot enter a complete squad (D-203), so each bowler's first squad is the next one to be bowled. The test now runs this loop for the four squads: batch, then that squad's lanes, scores, and complete, then the next batch. The sweepers and the rest of stage 7 (results) follow.

0. **Setup.** Empty schema, the first admin from the app's own script, the other users made through the add-user page (the invite email lands in a local mail catcher, which also tests the set-password flow), then the earlier tournament and its 50 bowlers.
1. **Tournament.** Create, edit a free field, check the overview.
2. **Divisions.** Create three; check the list and numbering.
3. **Squads and sweepers.** Create four squads and two sweepers with bonus pins; edit one of each; add a spare squad and a spare sweeper and delete them (`SQD-14`); check the cards.
4. **Registration and money.** Desk registrations and payments in the UI, the registration site's through the API key, returning bowlers updated, some edits and deletes. **Edits (`REG-15` to `REG-21`, D-197 to D-207):** a prepaid site bowler arrives at the desk and adds a squad; one bowler switches squads on the edit page; one drops a squad (check the refund line); one changes division and one changes average before scores; one adds and removes the super sweeper. Check counts for each squad, sweeper, and division, and each bowler's fees owed and paid, and the totals, against the hand-written fee table. _The desk path waits for the registration edit and payment screens (rule 3); only the registration site's API-key part can run now. The money checks wait for the same screens._
5. **Lanes.** Assign every bowler, open the recap sheets, and move some. No one is left unassigned and no pair is over its maximum. **Move to a later squad (D-202):** from a squad's lane page, move one bowler to a later squad of the same kind before any score. Check the bowler is gone from the first squad's lanes, lands in the later squad's unassigned list, and that both squads' counts, the summary, and the fee lines change as the hand-written table says. _The lane move now saves (`PUT …/lanes/{registrationId}`, D-216), so this step can drive it. Two browser contexts on one squad can also check that a move shows on the other page over the live stream (D-217)._
6. **Scores.** The director enters the designed scores squad by squad, edits one, and checks the Scores tab. **Did not finish (SCR-24, SCR-25):** flag one bowler on the pair sheet and check the full-game count moves past them; a saved score for that bowler clears the flag (D-250). _Score entry exists (D-228 to D-231), so this stage can run._
7. **Complete and results.** Complete every squad and sweeper; check each Results tab, At-large, Seeding, and Super sweeper, including "Unofficial results" before the last session completes (D-84, D-88). **Ranking modes (RES-42 to RES-46):** each Results tab ranks through the last full game by default, and `?mode=live` ranks every score; a flagged bowler does not hold back the count. **TV page (RES-49 to RES-54):** `/tournaments/{id}/liveResults` lists every squad division, sweeper, and the super sweeper, with the cut and cash lines as +/− (D-254), and updates when a score fills a game. _Complete squad and sweeper exist (`SQD-15`, `SQD-16`); score entry exists (D-228 to D-231), so this stage can run. Completing a squad with no scores saves zeros for each entered bowler (D-190)._
8. **Complete the tournament (`TRN-38` to `TRN-43`, D-256 to D-260).** From the overview, the director opens the dialog and checks its counts (open squads and sweepers, bowlers who get zeros, bowlers left as entered) against the hand-written numbers, types the name, and completes. Check the toast, the Completed badge, no Edit link or Danger zone, every squad and sweeper complete, the same zero rows as completing each squad by hand (D-190), no "Unofficial results" anywhere, and the edit routes frozen (D-130). Delete is refused (D-133). Run it once with every session already complete (flag only) and once with one open (counts only that one). _Complete tournament exists (D-256), so this stage can run._

9. **Access.** Walk the same pages as signed out, score keeper, director, and admin; check what shows and what the API refuses.

Stages that wait on a missing feature stay in the plan and are skipped in the run. We do not fake them with direct database writes.

## Scripted failures

Start with these; add one whenever a feature brings a new refusal.

| Stage     | Action                                                                           | Expect                                                   |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Divisions | Create a division with a name already used                                       | 409, list unchanged                                      |
| Squads    | Create a squad dated outside the tournament                                      | 409 with the message                                     |
| Squads    | Delete a squad that has entries (`SQD-14`, D-186)                                | 409 with `errors`, the squad stays                       |
| Lanes     | Edit lanes so a saved pair no longer fits                                        | 409 with `errors` (after stage 5 saves lanes)            |
| Register  | Put a man under 50 in the Women or Seniors division (REG-04e, D-107)             | 400 "Bowler too young for selected division" from the route (done); a refusal in the UI (not yet) |
| Register  | Repeat a payment code (D-109, D-118)                                             | A retry with the same id, no second entry (done)         |
| Scores    | Delete an entry that has a score (`REG-19`, D-211)                               | 409 with `errors.scores`, the entry stays (waits for score entry) |
| Register  | Delete a registration with a real payment from the site (D-210)                  | 409 with a warning and the total; deletes after the tick |
| Scores    | Enter a score above 300                                                          | Refused                                                  |
| Scores    | Enter or flag a score in a complete squad (D-228)                                | 409 with `errors`, nothing saved                         |
| Results   | Read results while `SessionDnf` is missing (run the SQL file first)              | 503; none in a run that ran `score-tables.sql`           |
| Scores    | Remove or move a bowler out of a squad where they have a score (`REG-34`, D-203) | 400, the entry and the lane stay                         |
| Complete  | Move a bowler out of a complete squad, or into one (D-10, D-202)                 | 400, nothing changes                                     |
| Register  | Remove a sweeper while the bowler is in the super sweeper (D-203)                | 400 "Remove the Super Sweeper first."                    |
| Register  | The site adds a squad while the desk edit is open, then the desk saves (D-199)   | 409 `changed`; the site's squad is kept                  |
| Complete  | Complete a squad that is already complete (D-192)                                | 409 with `errors`, no second set of zeros                |
| Complete  | Complete a tournament that is already complete (D-257)                           | 409 with `errors.tournament`, nothing changes            |
| Complete  | Complete a tournament that has no squad (D-257)                                  | 409 "Add a squad before you complete this tournament"    |
| Complete  | Edit a complete tournament                                                       | 409, every field frozen                                  |
| Delete    | Delete a tournament that has scores                                              | 409, no override                                         |
| Access    | Score keeper opens a director-only action                                        | Link hidden; API refuses                                 |

## Running it

- By hand (`npm run test:lifecycle` in `web/`), on `workflow_dispatch`, and from `.github/workflows/lifecycle.yml`, one workflow that two others call.
- **On every pull request** (`pull-request.yml`, job `Lifecycle test`) and **on every push to `main`** (`main.yml`), beside Sonar, mutation, and deploy. Deploy does not wait for it. The owner decided on 2026-11-11 to run it on pull requests too, not only on `main`.
- Aim for 15 minutes; fail at 30. A failure turns the run red; the owner decides what to do about the deploy. Make the job a required check on pull requests once it has been steady for a week.
- A failed run uploads `lifecycle-evidence` (traces, screenshots, video, the HTML report).

## Open questions

1. **The fee table.** It needs the legacy fee rules from [docs/migration/](../migration/README.md): tournament fee, squad fee, sweeper fee, handicap or super sweeper extras.
2. **Desk payments in the UI.** There is no payment screen yet. Q-38 in [decisions-and-questions.md](../migration/decisions-and-questions.md) asks whether the desk should record payments and refunds. If it says yes, stage 4's money checks wait for those screens. If it says keep money outside the app (option 1), stage 4 checks the collect, refund, and net lines on the edit Review step against the hand-written fee table, and nothing checks a recorded payment total.
3. **Resume after a failure.** A snapshot per stage would let us rerun from stage N. Decide once we know how slow the run is.

## Done when

Every stage that can run passes on a clean checkout in CI, three runs in a row give the same result, and the expected results match WinForms for the same data.
