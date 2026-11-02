import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { apiKeyHeader } from '../shared/auth/caller.ts'
import { sampleRequest } from '../test/registrationRequests.ts'
import { testApiKey } from '../test/factories.ts'
import { createTestApp } from '../test/testApp.ts'
import { createRegistrationRequestSchema } from '../features/registrations/request.ts'
import { buildOpenApiDocument, vendorRoutes } from './openapi.ts'

describe('GET /openapi/v1.json (D-114)', () => {
  it('is public and returns the document', async () => {
    const response = await request(createTestApp()).get('/openapi/v1.json')

    expect(response.status).toBe(200)
    expect(response.body.openapi).toBe('3.1.0')
    expect(response.body.info.title).toBe('Northeast Megabuck Tournament API')
  })

  it('lists every vendor route with its method', () => {
    const { paths } = buildOpenApiDocument()
    const documented = Object.entries(paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => ({ method, path })),
    )

    expect(
      documented.toSorted((a, b) => (a.method + a.path).localeCompare(b.method + b.path)),
    ).toEqual(vendorRoutes.toSorted((a, b) => (a.method + a.path).localeCompare(b.method + b.path)))
  })

  it.each(vendorRoutes)('has a route that answers $method $path', async ({ method, path }) => {
    const concrete = path.replace('{id}', '11111111-1111-4111-8111-111111111111')
    const test = request(createTestApp())[method](concrete).set(apiKeyHeader, testApiKey)

    const response = await test

    // The generic 404 means no route handled it.
    expect(response.body).not.toEqual({ message: 'Not found' })
  })

  it('describes the key as a header scheme and marks the registration routes with it', () => {
    const document = buildOpenApiDocument()

    expect(document.components.securitySchemes.apiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    })
    expect(document.paths['/v1/registrations'].post.security).toEqual([{ apiKey: [] }])
    expect(document.paths['/v1/registrations/{id}'].get.security).toEqual([{ apiKey: [] }])
    expect('security' in document.paths['/v1/tournaments'].get).toBe(false)
  })

  it('documents the create body as the schema the route checks, and its sample passes it (API-05)', () => {
    const document = buildOpenApiDocument()
    const schema = z
      .object({
        required: z.array(z.string()),
        properties: z.object({ registration: z.object({ required: z.array(z.string()) }) }),
      })
      .parse(
        document.paths['/v1/registrations'].post.requestBody.content['application/json'].schema,
      )

    expect(schema.required).toEqual(['registration'])
    expect(schema.properties.registration.required).toEqual(
      expect.arrayContaining([
        'tournamentId',
        'divisionId',
        'squads',
        'sweepers',
        'superSweeper',
        'bowler',
      ]),
    )
    expect(createRegistrationRequestSchema.safeParse(sampleRequest()).success).toBe(true)
  })

  it('documents 201 with a Location header, and 400 and 500 as problem details', () => {
    const { responses } = buildOpenApiDocument().paths['/v1/registrations'].post

    expect(responses['201'].headers.Location).toBeDefined()
    for (const status of ['400', '500'] as const) {
      expect(responses[status].content['application/problem+json'].schema).toEqual({
        $ref: '#/components/schemas/Problem',
      })
    }
  })
})
