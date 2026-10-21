# Registrations

A registration enters one bowler into one division of one tournament, for one or more squads and any sweepers.

Source: `business logic/Registrations/` (all subfolders), `business logic/Scores/ScoresRepository.cs`, `presentation/Registrations/`, `api/Registrations/`.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `bowlerId` | UUID | |
| `divisionId` | UUID | The tournament comes from the division |
| `average` | integer, nullable | Drives handicap and average limits. No average means no handicap |
| `superSweeper` | boolean | Opted into the super sweeper |
| squads | list | Via `SquadRegistration`; qualifying squads |
| sweepers | list | Via `SquadRegistration`; sweepers |
| payments | list | See [payments.md](payments.md) |

Two ways in: the **desk** (WinForms) and the **registration site** (API). Both run the same create logic.

## Core rules

| ID | Rule |
| --- | --- |
| REG-01 | **One registration per bowler per tournament.** Create looks for a bowler with the same USBC ID already registered in the tournament. If found, create fails with a conflict ("Bowler is already registered for this tournament."). The API then switches to **append** (`REG-10`). The scoring code assumes this rule (it reads "the" registration for a bowler). **D-03:** keep it; one division per bowler. |
| REG-02 | The bowler passes every bowler rule (`BWL-01` to `BWL-12`). |
| REG-03 | At least one qualifying squad. "Bowler must enter at least one squad". A sweeper-only entry is not possible. **D-04:** keep it, and apply it on update too (`REG-31`). |
| REG-04 | Eligibility (average, age, gender) as below. Legacy blocks; **D-01: the new app warns.** |
| REG-05 | A handicap division (percentage set) needs a USBC ID. "USBC Id is required for Handicap Divisions". See Q-05. |
| REG-06 | **Super sweeper needs every sweeper.** If `superSweeper` is true, the number of sweepers entered must equal the number of sweepers in the tournament. "Must enter all sweepers to enter Super Sweeper". |
| REG-07 | **Existing bowler.** If a bowler with the same USBC ID exists (in any tournament), the registration uses that record and overwrites **every** field with the submitted ones. Otherwise a new bowler is created. |

**Defect in REG-07 via the API:** the API body has no SSN, and missing gender becomes Female (`API-10`). So when the registration site enters a returning bowler, legacy **erases their stored SSN**, clears their date of birth if none was sent, and may flip their gender.

**D-05:** the new app treats this as a patch. Only fields the request sends overwrite stored values; SSN, date of birth, and gender keep their stored values when missing.
| REG-08 | A payment may come with the registration. Its time is set to now (UTC). The desk always sends a $0 `Manual_` placeholder (`PAY-01a`). |

**Defects in create** (do not copy): it does not check that the division and squads belong to the requested tournament, or that the squads are not complete. And with an empty USBC ID, the "already registered" and "existing bowler" lookups match every bowler with an empty USBC ID, so a second bowler without one is rejected as a duplicate, or the lookup fails.

## Eligibility

Inputs: the division's limits, the registration average, and the bowler's gender and date of birth. Age is measured on the tournament start date (`BWL-09`).

| ID | Check | Applies when | Legacy message |
| --- | --- | --- | --- |
| REG-04a | Average is present | Division has a min or max average | "Average is required for selected division" |
| REG-04b | Average ≥ minimum | Division has a min average | "Minimum average requirement for division not met" |
| REG-04c | Average ≤ maximum | Division has a max average | "Maximum average requirement for division not met" |
| REG-04d | Date of birth is present | Division has an age limit **and no gender** | "Date of birth required for selected division" |
| REG-04e | Age ≥ minimum age | Division has a min age, **unless** the division has a gender and the bowler is that gender | "Bowler too young for selected division" |
| REG-04f | Age ≤ maximum age | Division has a max age, same exception | "Bowler too old for selected division" |
| REG-04g | Gender is present | Division has a gender **and no age limits** | "Gender is required for selected division" |
| REG-04h | Gender matches | Division has a gender **and no age limits** | "Invalid gender for selected division" |

How gender and age combine:

| Division has | Bowler passes when |
| --- | --- |
| Gender only | Bowler is that gender |
| Age only | Bowler's age is inside the limits |
| Gender and age | Bowler is that gender, **or** bowler's age is inside the limits ("Women or Seniors") |

If the date of birth is missing in an age check, the bowler fails as "too young".

**Decision D-01:** the new app shows these as warnings and lets the entry through. Reason: the registration site takes payment and does not check division rules, so we must accept what it sends. The warning should still name the failed rule.

## Append (API only)

Runs when create hits `REG-01`. It adds to the bowler's existing registration.

| ID | Rule |
| --- | --- |
| REG-10 | Find the registration by USBC ID and tournament. None found: error "The specified registration does not exist." |
| REG-11 | Squads and sweepers in the request must not already be on the registration ("The specified squads are already registered." / "...sweepers..."). They are added. Completion is not checked. |
| REG-12 | If the request's division differs, the registration moves to it. Average and super sweeper take the request's value, or keep the old one if the request leaves them out. |
| REG-13 | The combined registration passes the full create validation (`REG-02` to `REG-06`). |
| REG-14 | Bowler details are overwritten (name, address, email, phone, USBC ID). Date of birth and gender change only if the request has them. A payment in the request is added. **D-05:** patch only the fields sent. |

## Update (API `PATCH /v1/registrations/{id}`)

Every part is optional; only the parts sent change.

| ID | Rule |
| --- | --- |
| REG-30 | Not found: 404 "Registration with ID {id} not found." |
| REG-31 | `squadIds` and `sweeperIds` are **full replacement** lists. If only one is sent, the other keeps its current value. Legacy accepts an empty `squadIds`, leaving no qualifying squad. **D-04:** reject that. |
| REG-32 | Every squad and sweeper id must belong to the tournament ("Invalid squad IDs" / "Invalid sweeper IDs"). |
| REG-33 | Added squads or sweepers must not be complete ("Cannot add squad(s) that are already complete."). |
| REG-34 | A removed squad or sweeper must have no scores for this bowler ("Bowler has already bowled in removed squads."). Dropping a squad this way is how the site refunds an entry (D-11). **D-10:** also refuse to drop a complete squad, scores or not. |
| REG-35 | If super sweeper is on (now or in the request), the sweeper list must include every sweeper ("Super Sweeper cannot be enrolled when not all sweepers are registered."). |
| REG-36 | Changing `superSweeper` is blocked once **any** bowler has a sweeper score in the tournament ("Cannot change Super Sweeper when sweeper scores have been recorded."). Turning it on also needs every sweeper. See Q-07. |
| REG-37 | `divisionId` must belong to the tournament ("Division ID is not valid for the tournament."). The eligibility checks (`REG-04`, `REG-05`) run against the new division. |
| REG-38 | `average` is applied **only when `divisionId` is also sent**. An average alone is ignored. **Defect.** |
| REG-39 | A `payment` is added. |

The API does not block a division change after scores exist. The desk does (`REG-15`).

## Desk changes

| ID | Rule |
| --- | --- |
| REG-15 | **Change division.** Blocked if the bowler has any score in the tournament (squad or sweeper): "Cannot change bowler division after scores have been recorded." The screen also edits gender, date of birth, USBC ID, and average; eligibility runs on the new values. Saves the division and average on the registration and the other three on the bowler. |
| REG-16 | **Change average.** Empty is allowed. Otherwise 1 to 300 ("Average must be greater than 0.", "Average must be less than or equal to 300."). No eligibility check. Handicap and results change at once, since they are computed live. See Q-08. |
| REG-17 | **Add super sweeper.** Confirm first. Fails if: any of the bowler's sweepers is complete; already in; the tournament has no sweepers; the bowler is not in every sweeper. |
| REG-18 | **Remove super sweeper.** Confirm first. Fails if not in, or if the bowler has any sweeper score in the tournament. |
| REG-19 | **Delete registration.** Confirm: "Are you sure you want to delete this bowler's entire registration?" Fails if the bowler has any score in the tournament: "Cannot delete registration with scores." Removes the squad links and payments. The bowler record stays. |
| REG-20 | **Remove from one squad** (lane screen). Confirm: "Are you sure you want remove bowler from this squad (Refund may be required)?" Fails if the bowler has scores in that squad: "Cannot remove bowler from squad when scores have been recorded". **D-06, D-11:** this is how a refund works. The money is handled outside the app; removing the squad entry is all our system does, and the entry stops counting. **D-10:** no removals once the squad is complete. |
| REG-21 | **Add to another squad or sweeper** (lane screen). Search shows bowlers registered in the tournament and not already on this squad. No other check: completion and the super sweeper rule are not checked. The bowler lands in "unassigned". |
| REG-22 | **New registration from a lane screen** pre-selects that squad. |

## Desk add screen

- Divisions sorted by number.
- Only squads and sweepers that are **not complete**, sorted by date.
- The desk picks an existing bowler from search or enters a new one.

## Registration list

| ID | Rule |
| --- | --- |
| REG-23 | Sorted by last name, then first name. Columns: bowler, division, squads entered (count), sweepers entered (count), super sweeper. A name filter narrows the list. |
| REG-24 | Counts shown: entries per squad; entries per sweeper; super sweeper entries; entries per division = sum of **squads** each bowler in that division entered (sweepers not counted). |
| REG-25 | Actions: delete registration, edit bowler name, add or remove super sweeper, change division, change average, edit bowler. |
