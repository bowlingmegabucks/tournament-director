import { z } from 'zod'
import { validation, type Failure } from './problem.ts'

// A name or id that is only spaces counts as empty, as FluentValidation's NotEmpty does.
const required = z.string().trim().min(1)

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
})

const bowlerSchema = z.object({
  firstName: required,
  middleInitial: z.string().nullish(),
  lastName: required,
  suffix: z.string().nullish(),
  address: addressSchema,
  email: z.email(),
  phoneNumber: z.string().nullish(),
  usbcId: required,
  dateOfBirth: z.iso.date().nullish(),
  /** `"M"` or `"F"`. Anything else, or nothing, is Male (D-113). */
  gender: z.string().nullish(),
})

// The stored code is `<system>_<code>` in a varchar(43) with amount decimal(5,2) (PAY-02).
const paymentSchema = z
  .object({
    processingSystem: required,
    confirmationCode: required,
    amount: z.number().min(0).max(999.99),
  })
  .refine((payment) => `${payment.processingSystem}_${payment.confirmationCode}`.length <= 43, {
    message: 'The payment code is too long',
  })

/** `API-05`. The `squads` and `sweepers` lists and `superSweeper` are required, as in legacy. */
export const createRegistrationRequestSchema = z.object({
  registration: z.object({
    tournamentId: z.uuid(),
    divisionId: z.uuid(),
    average: z.number().int().nullish(),
    squads: z.array(z.uuid()).min(1),
    sweepers: z.array(z.uuid()),
    superSweeper: z.boolean(),
    bowler: bowlerSchema,
    payment: paymentSchema.nullish(),
  }),
})

export type CreateRegistrationRequest = z.infer<typeof createRegistrationRequestSchema>
export type RegistrationInput = CreateRegistrationRequest['registration']
export type BowlerInput = RegistrationInput['bowler']
export type PaymentInput = NonNullable<RegistrationInput['payment']>

// The `API-09*` codes and the legacy wording. Keyed by the path below `registration`.
const checks: Record<string, { code: string; description: string }> = {
  tournamentId: { code: 'Registration.TournamentIdInvalid', description: 'Invalid Tournament ID' },
  divisionId: { code: 'Registration.DivisionIdInvalid', description: 'Invalid Division ID' },
  'bowler.firstName': {
    code: 'Registration.BowlerFirstNameRequired',
    description: "Bowler's first name is required.",
  },
  'bowler.lastName': {
    code: 'Registration.BowlerLastNameRequired',
    description: "Bowler's last name is required.",
  },
  'bowler.address': {
    code: 'Registration.BowlerAddressRequired',
    description: "Bowler's address is required.",
  },
  'bowler.email': {
    code: 'Registration.BowlerEmailInvalid',
    description: 'A valid email address is required for the bowler.',
  },
  'bowler.usbcId': {
    code: 'Registration.BowlerUsbcIdRequired',
    description: 'USBC ID is required for the bowler.',
  },
  squads: {
    code: 'Registration.SquadsRequired',
    description: 'At least one squad must be entered.',
  },
  payment: { code: 'Payment.Invalid', description: 'The payment is not valid.' },
}

function describeIssue(issue: z.core.$ZodIssue): { code: string; description: string } {
  const [root, ...rest] = issue.path
  if (root !== 'registration' || rest.length === 0) {
    return { code: 'Registration.Required', description: 'Registration details are required.' }
  }
  // `bowler.address.street` is checked as `bowler.address`; `squads.0` as `squads`.
  const keys = rest.map(String)
  const known = [keys.join('.'), keys.slice(0, 2).join('.'), keys[0] ?? '']
    .map((key) => checks[key])
    .find((check) => check !== undefined)
  if (known) return known
  return {
    code: 'Registration.Invalid',
    description: `${keys.join('.')}: ${issue.message}`,
  }
}

export type ParsedRequest =
  { success: true; data: CreateRegistrationRequest } | { success: false; failures: Failure[] }

/** `API-09` to `API-09f`: every failed check, once each, before any business rule runs. */
export function parseCreateRequest(body: unknown): ParsedRequest {
  const result = createRegistrationRequestSchema.safeParse(body)
  if (result.success) return { success: true, data: result.data }

  const seen = new Set<string>()
  const failures: Failure[] = []
  for (const issue of result.error.issues) {
    const { code, description } = describeIssue(issue)
    if (seen.has(code)) continue
    seen.add(code)
    failures.push(validation(code, description))
  }
  return { success: false, failures }
}
