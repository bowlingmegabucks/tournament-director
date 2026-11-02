import { Router } from 'express'
import { z } from 'zod'
import { createRegistrationRequestSchema } from '../features/registrations/request.ts'
import { updateRegistrationRequestSchema } from '../features/registrations/updateRequest.ts'
import { problemSchema } from '../features/registrations/problem.ts'
import {
  createRegistrationResponseSchema,
  registrationDetailResponseSchema,
} from '../features/registrations/vendorTypes.ts'
import { tournamentDetailSchema, tournamentListSchema } from '../features/tournaments/types.ts'

type Method = 'get' | 'post' | 'patch' | 'delete'

/**
 * The routes the registration site can call (`API-01` to `API-06`, D-09). Add each vendor route here
 * when it ships; a test fails if the document and this list disagree, and checks each one answers.
 */
export const vendorRoutes: { method: Method; path: string }[] = [
  { method: 'get', path: '/' },
  { method: 'get', path: '/health' },
  { method: 'get', path: '/ready' },
  { method: 'get', path: '/v1/tournaments' },
  { method: 'get', path: '/v1/tournaments/{id}' },
  { method: 'post', path: '/v1/registrations' },
  { method: 'get', path: '/v1/registrations/{id}' },
  { method: 'patch', path: '/v1/registrations/{id}' },
  { method: 'delete', path: '/v1/registrations/{id}' },
]

// Request bodies use the input shape (before trimming); responses use what we send.
const input = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input' })
const output = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'output' })

const json = (schema: object) => ({ 'application/json': { schema } })
const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
})

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
}

const protectedByKey = [{ apiKey: [] }]

/** The OpenAPI 3.1 document for the vendor routes (D-114), built from the routes' own Zod schemas. */
export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Northeast Megabuck Tournament API',
      version: 'v1',
      description:
        'The routes the registration site calls. Send the shared key in the x-api-key header on the registration routes.',
    },
    paths: {
      '/': {
        get: {
          summary: 'Names the API.',
          operationId: 'root',
          responses: {
            '200': {
              description: 'The API name as plain text.',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/health': {
        get: {
          summary: 'Liveness check.',
          operationId: 'health',
          responses: {
            '200': {
              description: 'The API is running.',
              content: json({
                type: 'object',
                properties: { status: { const: 'ok' } },
                required: ['status'],
              }),
            },
          },
        },
      },
      '/ready': {
        get: {
          summary: 'Readiness check: the database answers.',
          operationId: 'ready',
          responses: {
            '200': { description: 'The database answers.' },
            '503': { description: 'The database does not answer.' },
          },
        },
      },
      '/v1/tournaments': {
        get: {
          summary: 'Lists tournaments.',
          operationId: 'listTournaments',
          responses: {
            '200': {
              description: 'Every tournament.',
              content: json(output(tournamentListSchema)),
            },
          },
        },
      },
      '/v1/tournaments/{id}': {
        get: {
          summary: 'Gets a tournament with its divisions, squads, and sweepers.',
          operationId: 'getTournament',
          parameters: [idParameter],
          responses: {
            '200': {
              description: 'The tournament.',
              content: json(output(tournamentDetailSchema)),
            },
            '400': { description: 'The id is not a UUID.' },
            '404': { description: 'No tournament has this id.' },
          },
        },
      },
      '/v1/registrations': {
        post: {
          summary: "Creates a registration, or adds to the bowler's existing one.",
          description:
            'When the bowler is already registered in the tournament, the squads and sweepers are added to that registration and the answer is the same 201. A payment code already on file is a retry: the answer is 201 with the registration that holds it. Failed checks answer 400; a tournament, division, or registration that does not exist answers 500.',
          operationId: 'createRegistration',
          security: protectedByKey,
          requestBody: { required: true, content: json(input(createRegistrationRequestSchema)) },
          responses: {
            '201': {
              description: 'The registration was created or added to.',
              headers: {
                Location: {
                  description: 'The address of the registration.',
                  schema: { type: 'string' },
                },
              },
              content: json(output(createRegistrationResponseSchema)),
            },
            '400': problem('A check failed. Each reason is in `errors`.'),
            '401': { description: 'The key is missing or wrong.' },
            '429': problem('Too many requests.'),
            '500': problem('The tournament or division does not exist, or an unexpected error.'),
          },
        },
      },
      '/v1/registrations/{id}': {
        get: {
          summary: 'Gets a registration.',
          description: 'Payments and the social security number are never returned.',
          operationId: 'getRegistration',
          security: protectedByKey,
          parameters: [idParameter],
          responses: {
            '200': {
              description: 'The registration.',
              content: json(output(registrationDetailResponseSchema)),
            },
            '400': { description: 'The id is not a UUID.' },
            '401': { description: 'The key is missing or wrong.' },
            '404': problem('No registration has this id.'),
          },
        },
        patch: {
          summary: 'Changes a registration.',
          description:
            'Send only what changes. `squadIds` and `sweeperIds` replace the stored lists; a list left out stays. A request without a real payment (not Manual, amount above 0) also cannot leave the registration with no squad, drop a complete squad or sweeper, or change the division once the bowler has scores. A payment code already on file is a retry: the answer is 204 and nothing changes. Failed checks answer 400; an unknown registration answers 500.',
          operationId: 'updateRegistration',
          security: protectedByKey,
          parameters: [idParameter],
          requestBody: { required: true, content: json(input(updateRegistrationRequestSchema)) },
          responses: {
            '204': { description: 'The registration was changed.' },
            '400': problem('A check failed. Each reason is in `errors`.'),
            '401': { description: 'The key is missing or wrong.' },
            '429': problem('Too many requests.'),
            '500': problem('The registration does not exist, or an unexpected error.'),
          },
        },
        delete: {
          summary: 'Deletes a registration.',
          description:
            'Removes the registration with its squad entries and payments. The bowler record stays. Refused with 400 once the bowler has a score in the tournament.',
          operationId: 'deleteRegistration',
          security: protectedByKey,
          parameters: [idParameter],
          responses: {
            '204': { description: 'The registration was deleted.' },
            '400': problem('The bowler has scores in the tournament.'),
            '401': { description: 'The key is missing or wrong.' },
            '404': problem('No registration has this id.'),
          },
        },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
      schemas: { Problem: output(problemSchema) },
    },
  }
}

/** `GET /openapi/v1.json` (D-114). The document is built once, at startup. */
export function createOpenApiRouter(): Router {
  const document = buildOpenApiDocument()
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    res.json(document)
  })
  return router
}
