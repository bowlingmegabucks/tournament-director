import { z } from 'zod'
import { paymentSchema, parseWith, type ParsedRequest } from './request.ts'

/**
 * `API-07`: what the registration site sends to change a registration. Everything but the id is
 * optional; a field left out keeps its stored value (REG-31, REG-38).
 */
export const updateRegistrationRequestSchema = z.object({
  registration: z.object({
    registrationId: z.uuid(),
    divisionId: z.uuid().nullish(),
    average: z.number().int().nullish(),
    squadIds: z.array(z.uuid()).nullish(),
    sweeperIds: z.array(z.uuid()).nullish(),
    superSweeper: z.boolean().nullish(),
    payment: paymentSchema.nullish(),
  }),
})

export type UpdateRegistrationRequest = z.infer<typeof updateRegistrationRequestSchema>
export type UpdateInput = UpdateRegistrationRequest['registration']

const checks = {
  registrationId: { code: 'Registration.IdInvalid', description: 'Invalid Registration ID' },
  divisionId: { code: 'Registration.DivisionIdInvalid', description: 'Invalid Division ID' },
  squadIds: { code: 'Registration.SquadIdsInvalid', description: 'Invalid squad IDs' },
  sweeperIds: { code: 'Registration.SweeperIdsInvalid', description: 'Invalid sweeper IDs' },
  payment: { code: 'Payment.Invalid', description: 'The payment is not valid.' },
}

export function parseUpdateRequest(body: unknown): ParsedRequest<UpdateRegistrationRequest> {
  return parseWith(updateRegistrationRequestSchema, checks, body)
}
