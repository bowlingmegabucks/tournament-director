import express, { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { mountRoutes, type RouteGroup } from './mountRoutes.ts'

function pingRouter(): Router {
  const router = Router()
  router.get('/', (_req, res) => {
    res.json({ ok: true })
  })
  return router
}

describe('mountRoutes', () => {
  it('mounts a public group (API-15)', async () => {
    const app = express()

    mountRoutes(app, [{ path: '/ping', access: 'public', router: pingRouter() }])

    const response = await request(app).get('/ping')
    expect(response.body).toEqual({ ok: true })
  })

  it('stops startup for a group with no access label (API-15)', () => {
    // Bypasses the type check, as plain JavaScript or a bad cast would.
    const group = { path: '/ping', router: pingRouter() } as unknown as RouteGroup

    expect(() => {
      mountRoutes(express(), [group])
    }).toThrow('Route group "/ping" needs an access label')
  })

  it('stops startup for an unknown access label (API-15)', () => {
    const group = { path: '/ping', access: 'admin', router: pingRouter() } as unknown as RouteGroup

    expect(() => {
      mountRoutes(express(), [group])
    }).toThrow('Route group "/ping" needs an access label')
  })

  it('mounts nothing before a bad group stops it', () => {
    const app = express()
    const bad = { path: '/bad', router: pingRouter() } as unknown as RouteGroup

    expect(() => {
      mountRoutes(app, [bad])
    }).toThrow()
  })
})
