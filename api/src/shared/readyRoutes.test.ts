import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../test/testApp.ts'
import { HttpError } from './errors.ts'

describe('GET /ready', () => {
  it('reports ok after asking the database (D-32)', async () => {
    const checkDatabase = vi.fn(() => Promise.resolve())

    const response = await request(createTestApp({ checkDatabase })).get('/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(checkDatabase).toHaveBeenCalledOnce()
  })

  it('answers 503 while the database is down (D-32)', async () => {
    const checkDatabase = () => Promise.reject(new HttpError(503, 'Database unavailable'))

    const response = await request(createTestApp({ checkDatabase })).get('/ready')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ message: 'Database unavailable' })
  })

  it('leaves /health alone when the database is down (D-32)', async () => {
    const checkDatabase = vi.fn(() => Promise.reject(new HttpError(503, 'Database unavailable')))

    const response = await request(createTestApp({ checkDatabase })).get('/health')

    expect(response.status).toBe(200)
    expect(checkDatabase).not.toHaveBeenCalled()
  })

  it('is public (D-27)', async () => {
    const response = await request(createTestApp()).get('/ready')

    expect(response.status).toBe(200)
  })
})
