# Bowlers

A bowler is a person. The same record is reused across tournaments.

Source: `business logic/Bowlers/`, `business logic/Validators/`, `business logic/Models/BowlerModel.cs`, `business logic/Models/PersonNameModel.cs`, `business logic/BusinessLogicExtensions.cs` (phone), `presentation/Bowlers/`.

## Fields

| Field | Type | Stored as | Notes |
| --- | --- | --- | --- |
| `id` | UUID | `char(36)` | |
| `firstName` | text | | Required |
| `middleInitial` | 1 char | `char(1)`, `''` if none | Not shown in the display name |
| `lastName` | text | | Required |
| `suffix` | text | `''` if none | "Jr", "III" |
| `streetAddress` | text | `''` if none | |
| `cityAddress` | text | `''` if none | |
| `stateAddress` | 2 chars | `char(2)` | Postal code, for example `NC` |
| `zipCode` | 5 or 9 digits | `char(9)` | No dash |
| `emailAddress` | text | `''` if none | Required by the API, optional on the desk |
| `phoneNumber` | 10 digits | `char(10)`, `''` if none | Normalized on save (`BWL-07`) |
| `usbcId` | text | `''` if none | Format `digits-digits` |
| `dateOfBirth` | date | nullable | |
| `gender` | Male / Female | nullable int | See [database.md](database.md#gender-bowlersgender-divisionsgender) |
| `socialSecurityNumber` | 9 digits | encrypted text, `''` if none | Never shown; see `BWL-17` and [security.md](security.md) |

## Validation

Applies when adding or updating a bowler, and to the bowler inside every new registration.

| ID | Rule | Message |
| --- | --- | --- |
| BWL-01 | First name required | "First Name is Required" |
| BWL-02 | Last name required | "Last Name is Required" |
| BWL-03 | Middle initial is empty or 1 character | "Middle Initial must only be 1 character" |
| BWL-04 | If street is given: city required; state required and exactly 2 characters; zip valid (5 or 9 digits, all numeric) | "City is Required when Street is given", "State must be Postal Abbreviation", "State is required when Street is given", "Valid Zip Code required when Street is given" |
| BWL-05 | If city is given: state required | "State required when City is given" |
| BWL-06 | Email, if given, is a valid address | "Invalid Email" |
| BWL-07 | Phone, if given, matches `^\s*\+?1?\s*([0-9][\s\-\.]*){9,}(\s*(ext\|x\|extension)\.?\s*\d{1,6})?$` (case-insensitive) | "Invalid Phone Number" |
| BWL-08 | Date of birth, if given, is before today | "Date of Birth must be in the past" |
| BWL-10 | USBC ID, if given, matches `^\d+-\d+$` | "Invalid USBC Id" |
| BWL-11 | SSN, if given, decrypts to exactly 9 digits | "Invalid Social Security Number" |
| BWL-12 | Adding: id must be empty. Updating: id must be set | "Bowler id must be empty" / "must not be empty" |

Zip is only checked when a street is given. A city with no street needs a state but no zip.

## Formatting and derived values

| ID | Rule | Status |
| --- | --- | --- |
| BWL-07a | **Phone storage.** Keep digits only. Drop a leading `1` country code (when the input starts with `+1` or `1 `, or when there are 11 digits starting with 1). Store exactly 10 digits, or `''` if there are not 10. Extensions are dropped. |  |
| BWL-09 | **Age on a date** = years between date of birth and that date, minus 1 if the birthday has not come yet that year. No date of birth means no age. Eligibility uses the tournament start date. |  |
| BWL-13 | **Display name** = `First Last`, plus `, Suffix` if there is one. Example: `John Smith, Jr`. Used on every screen and report. Middle initial is never shown. The registration list uses it (D-47). | Done |

## Search

The desk searches bowlers before registering or adding one to a squad.

| ID | Rule |
| --- | --- |
| BWL-14 | Filters, all optional and combined with AND: last name **starts with**; first name **starts with**; email **equals**; registered in tournament X; not registered in tournament X; not already on any of squads Y; USBC ID **equals** (code only); bowler id (code only). Case follows the database collation (case-insensitive by default). **D-49:** the registration grid has one box that matches first name, last name, and USBC ID by word prefix in the browser; the rest of BWL-14 waits for add registration. |

## Identity and updates

| ID | Rule | Status |
| --- | --- | --- |
| BWL-15 | A bowler is global. The API finds an existing bowler only by exact USBC ID. The desk picks a bowler from search, or creates a new one. Nothing stops two records for the same person. |  |
| BWL-16 | Two desk edits: **name only** (first, middle, last, suffix) and **full update** (every field). Full update replaces every field, including SSN, gender, and date of birth. |  |
| BWL-16a | A new registration for an existing USBC ID **overwrites** that bowler's details with the submitted ones (`REG-07`). Through the API this erases the stored SSN; see the defect under `REG-07`. **D-05:** the new app patches only the fields sent. |  |
| BWL-17 | The SSN is never displayed. The field shows a dummy masked value when one is stored. Staff can check a value by retyping it; the app encrypts the retyped value, decrypts both, and says "Matches" or "Does Not Match". **D-47:** the new read model never selects the column. | Done (display only; Verify later) |
| BWL-18 | Changing division on a registration also saves gender, date of birth, and USBC ID onto the bowler (`REG-15`). |  |
