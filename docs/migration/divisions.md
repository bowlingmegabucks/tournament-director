# Divisions

A division is a bracket inside one tournament. It sets the handicap formula and who may enter.

Source: `business logic/Divisions/`, `business logic/Models/DivisionModel.cs`, `presentation/Divisions/`, `main/Controls/DivisionControl.cs`.

## Fields

| Field                              | Type          | Required | Notes                                                                                                                                       |
| ---------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | UUID          | yes      |                                                                                                                                             |
| `tournamentId`                     | UUID          | yes      |                                                                                                                                             |
| `number`                           | integer       | yes      | Display order. Legacy does not check uniqueness. **D-38:** unique per tournament in the new app (`DIV-15`); the database key comes at 1.0.0 |
| `name`                             | text          | yes      |                                                                                                                                             |
| `minimumAge`, `maximumAge`         | integer       | no       | Age on the tournament start date                                                                                                            |
| `minimumAverage`, `maximumAverage` | integer       | no       | Compared with the registration average                                                                                                      |
| `handicapPercentage`               | decimal       | no       | Stored as a fraction (`0.90`). The screen shows and accepts a percent (`90`) and divides by 100. A screen value of 0 saves as NULL          |
| `handicapBase`                     | integer       | no       | The score handicap counts up to, for example 220                                                                                            |
| `maximumHandicapPerGame`           | integer       | no       | Cap on handicap per game                                                                                                                    |
| `gender`                           | Male / Female | no       | NULL means any gender                                                                                                                       |

A **handicap division** is one with `handicapPercentage` set. A **scratch division** has neither percentage nor base.

## Validation when adding

| ID     | Rule                                                                                                                                                                                                                                            | Status                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| DIV-01 | Number must be greater than 0. **D-38:** and unique within the tournament (new rule `DIV-15`: "Division number is already used in this tournament"). **D-139:** the server assigns the number (highest + 1), so the rule holds by construction. | Done, differs (D-139)        |
| DIV-02 | Name is required. **D-140, D-141:** trimmed, 1 to 100 characters, and unique in the tournament (ignoring case).                                                                                                                                 | Done, differs (D-140, D-141) |
| DIV-03 | Tournament is required. **D-138:** the URL names the tournament; unknown is a 404, a complete one a 409 (D-143).                                                                                                                                | Done                         |
| DIV-04 | Minimum age, if set, is greater than 0. Maximum age, if set, is greater than 0. **D-141:** ages are 1 to 120.                                                                                                                                   | Done, differs (D-141)        |
| DIV-05 | If both ages are set, minimum ≤ maximum.                                                                                                                                                                                                        | Done                         |
| DIV-06 | Minimum and maximum average, if set, are each greater than 0 and less than 300. **D-141:** averages are whole numbers, 1 to 300 (legacy: below 300).                                                                                            | Done, differs (D-141)        |
| DIV-07 | If both averages are set, minimum ≤ maximum.                                                                                                                                                                                                    | Done                         |
| DIV-08 | Handicap percentage, if set, is 0 or more. **D-141, D-142:** whole percent 1 to 999 (a typed 0 is refused; blank means none); over 100 asks for a confirm.                                                                                      | Done, differs (D-141, D-142) |
| DIV-09 | Handicap percentage and handicap base go together: set both or neither.                                                                                                                                                                         | Done                         |
| DIV-10 | Handicap base, if set, is between 0 and 300.                                                                                                                                                                                                    | Done                         |
| DIV-11 | Maximum handicap per game, if set, is greater than 0, and is allowed only when both base and percentage are set. **D-141:** the cap is 1 to 300.                                                                                                | Done, differs (D-141)        |

Each rule has its own message, for example "Minimum average must be less than or equal to maximum average".

## Eligibility the division imposes

These rules run when a bowler registers or changes division. The full logic, including how gender and age combine, is in [registrations.md](registrations.md#eligibility). Summary:

| Setting             | Effect                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Min or max average  | Average required and must be inside the range                                                                                                              |
| Min or max age      | Date of birth needed; age on tournament start must be inside the range                                                                                     |
| Gender              | Bowler's gender must match                                                                                                                                 |
| Gender **and** age  | "Either" rule: a bowler of the division's gender skips the age check; others must meet the age limits. This is how a "Women or Seniors 50+" division works |
| Handicap percentage | Bowler must have a USBC ID                                                                                                                                 |

**Decision D-01:** the new app warns about failed eligibility but does not block it. See [decisions-and-questions.md](decisions-and-questions.md).

## Behavior

| ID     | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DIV-12 | Legacy can only **add** and **list** divisions. No edit or delete. **D-12:** the new app adds editing. Changing criteria (age, average, gender) after bowlers are registered shows a warning: the change is not retroactive, registered bowlers may no longer fit, and the director must review them by hand. Field-by-field rules are decided when we build it. **D-15:** deleting is allowed too; when, and what happens to registrations, is part of the same discussion. **D-37, D-39, D-40:** the list is built first: two routes, bad rows skipped, a table page. **D-138 to D-145:** add is built next (`createDivision`, 0.6.0): a web-only `POST`, a new `divisions.create` permission, and a separate form page. | List and add done, differs (D-37, D-39, D-40, D-138 to D-145); edit, delete later |
| DIV-13 | Lists sort by `number` on the registration screen. **D-38:** the API sorts by `number`, then `name`, since old rows may share a number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Done, differs (D-38)                                                              |
| DIV-14 | Adding a sweeper lists all divisions so the desk can set bonus pins for each (`SQD-13`). **D-45:** the read part is built with the sweeper list (`SQD-22`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                                   |
| DIV-15 | New. Division `number` is unique within a tournament (D-38). Checked on add and edit; the database key waits for 1.0.0. Add: with create (D-139); edit: later. **D-139, D-140:** the number holds by construction on add; the name is checked too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Add done, differs (D-139, D-140); edit later                                      |

## Handicap

The formula lives in [scores.md](scores.md#handicap) (`SCR-07`). It uses the division's base, percentage, and cap with the registration's average.
