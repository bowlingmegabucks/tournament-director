import { z } from 'zod'
import { vendorDivisionSchema } from '../divisions/types.ts'
import { vendorSquadSchema } from '../squads/types.ts'
import { vendorSweeperSchema } from '../sweepers/types.ts'

/** `API-05`/`API-11`: the id of the new, or existing, registration. */
export const createRegistrationResponseSchema = z.object({ registrationId: z.uuid() })

/**
 * `API-06`: the registration as the registration site reads it. No payments (PAY-06) and no SSN
 * (BWL-17). Extra fields are safe to add; changing or removing one needs a vendor change doc (D-09).
 */
export const registrationDetailResponseSchema = z.object({
  registration: z.object({
    id: z.uuid(),
    tournamentId: z.uuid(),
    average: z.number().int().nullable(),
    superSweeper: z.boolean(),
    bowler: z.object({
      id: z.uuid(),
      firstName: z.string(),
      middleInitial: z.string(),
      lastName: z.string(),
      suffix: z.string(),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zipCode: z.string(),
      }),
      email: z.string(),
      phoneNumber: z.string(),
      usbcId: z.string(),
      dateOfBirth: z.iso.date().nullable(),
      gender: z.enum(['Male', 'Female']).nullable(),
    }),
    division: vendorDivisionSchema,
    squads: z.array(vendorSquadSchema),
    sweepers: z.array(vendorSweeperSchema),
  }),
})

export type RegistrationDetailResponse = z.infer<typeof registrationDetailResponseSchema>
