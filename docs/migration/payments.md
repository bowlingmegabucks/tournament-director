# Payments

Legacy records payments; it does not take them. The registration site takes the money and sends a record with the registration.

Source: `presentation/Registrations/Add/AddRegistrationAdapter.cs` (desk placeholder), `business logic/Database/Entities/PaymentEntity.cs`, `business logic/Models/PaymentModel.cs`, `business logic/Registrations/`, `api/Registrations/PaymentInput.cs`.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `registrationId` | UUID | Deleted with the registration |
| `confirmationCode` | text, max 43, unique | `<ProcessingSystem>_<ConfirmationCode>` |
| `amount` | money, 2 places | Max 999.99 |
| `createdAtUtc` | date and time, UTC | Set by the server when saved |

## Rules

| ID | Rule |
| --- | --- |
| PAY-01 | Real payments arrive only through the API: on create (`REG-08`), append (`REG-14`), or update (`REG-39`). The desk has no payment screen and does not show payments. |
| PAY-01a | **Desk registrations save a $0 placeholder payment** with code `Manual_<UUID v7>` (7 + 36 = 43 characters, exactly the column limit). This marks the entry as made at the desk; money taken at the desk is not recorded. See Q-17. |
| PAY-02 | The API sends `processingSystem`, `confirmationCode`, and `amount`. Legacy stores the code as `processingSystem + "_" + confirmationCode`. |
| PAY-03 | The stored code must be unique. A repeat fails at the database (unique index) and the request returns a server error. There is no friendly duplicate check. See Q-16. |
| PAY-04 | `createdAtUtc` is set to the server's current UTC time, not taken from the request. |
| PAY-05 | No check compares the amount with the fees owed. There is no balance, refund, or "paid" status. |
| PAY-06 | `GET /v1/registrations/{id}` loads payments but the response does not include them. |

The 43-character limit fits a base64url-encoded 32-byte value. Long system names can push a code past 43 characters; the database then rejects it.
