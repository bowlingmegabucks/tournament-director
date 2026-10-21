# Divisions

A division is a bracket inside one tournament. It sets the handicap formula and who may enter.

Source: `business logic/Divisions/`, `business logic/Models/DivisionModel.cs`, `presentation/Divisions/`, `main/Controls/DivisionControl.cs`.

## Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `tournamentId` | UUID | yes | |
| `number` | integer | yes | Display order. Not checked for uniqueness |
| `name` | text | yes | |
| `minimumAge`, `maximumAge` | integer | no | Age on the tournament start date |
| `minimumAverage`, `maximumAverage` | integer | no | Compared with the registration average |
| `handicapPercentage` | decimal | no | Stored as a fraction (`0.90`). The screen shows and accepts a percent (`90`) and divides by 100. A screen value of 0 saves as NULL |
| `handicapBase` | integer | no | The score handicap counts up to, for example 220 |
| `maximumHandicapPerGame` | integer | no | Cap on handicap per game |
| `gender` | Male / Female | no | NULL means any gender |

A **handicap division** is one with `handicapPercentage` set. A **scratch division** has neither percentage nor base.

## Validation when adding

| ID | Rule |
| --- | --- |
| DIV-01 | Number must be greater than 0. |
| DIV-02 | Name is required. |
| DIV-03 | Tournament is required. |
| DIV-04 | Minimum age, if set, is greater than 0. Maximum age, if set, is greater than 0. |
| DIV-05 | If both ages are set, minimum ≤ maximum. |
| DIV-06 | Minimum and maximum average, if set, are each greater than 0 and less than 300. |
| DIV-07 | If both averages are set, minimum ≤ maximum. |
| DIV-08 | Handicap percentage, if set, is 0 or more. |
| DIV-09 | Handicap percentage and handicap base go together: set both or neither. |
| DIV-10 | Handicap base, if set, is between 0 and 300. |
| DIV-11 | Maximum handicap per game, if set, is greater than 0, and is allowed only when both base and percentage are set. |

Each rule has its own message, for example "Minimum average must be less than or equal to maximum average".

## Eligibility the division imposes

These rules run when a bowler registers or changes division. The full logic, including how gender and age combine, is in [registrations.md](registrations.md#eligibility). Summary:

| Setting | Effect |
| --- | --- |
| Min or max average | Average required and must be inside the range |
| Min or max age | Date of birth needed; age on tournament start must be inside the range |
| Gender | Bowler's gender must match |
| Gender **and** age | "Either" rule: a bowler of the division's gender skips the age check; others must meet the age limits. This is how a "Women or Seniors 50+" division works |
| Handicap percentage | Bowler must have a USBC ID |

**Decision D-01:** the new app warns about failed eligibility but does not block it. See [decisions-and-questions.md](decisions-and-questions.md).

## Behavior

| ID | Rule |
| --- | --- |
| DIV-12 | Legacy can only **add** and **list** divisions. No edit or delete. **D-12:** the new app adds editing. Changing criteria (age, average, gender) after bowlers are registered shows a warning: the change is not retroactive, registered bowlers may no longer fit, and the director must review them by hand. Field-by-field rules are decided when we build it. **D-15:** deleting is allowed too; when, and what happens to registrations, is part of the same discussion. |
| DIV-13 | Lists sort by `number` on the registration screen. |
| DIV-14 | Adding a sweeper lists all divisions so the desk can set bonus pins for each (`SQD-13`). |

## Handicap

The formula lives in [scores.md](scores.md#handicap) (`SCR-07`). It uses the division's base, percentage, and cap with the registration's average.
