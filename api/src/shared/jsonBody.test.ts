import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { HttpError } from './errors.ts'
import { jsonBody } from './jsonBody.ts'

function createTestApp() {
  const app = express()
  app.post('/', jsonBody, (req, res) => {
    res.json({ received: req.body })
  })
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof HttpError) res.status(err.status).json({ message: err.message })
      else res.status(500).json({ message: 'unexpected' })
    },
  )
  return app
}

describe('jsonBody', () => {
  it('parses a JSON body', async () => {
    const response = await request(createTestApp()).post('/').send({ name: 'Ada' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: { name: 'Ada' } })
  })

  it('answers a body that is not JSON with a 400', async () => {
    const response = await request(createTestApp())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{nope')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('answers a body over 10 KB with a 400', async () => {
    const response = await request(createTestApp())
      .post('/')
      .send({ filler: 'x'.repeat(11 * 1024) })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'The request body is not valid JSON.' })
  })

  it('accepts a body just under 10 KB', async () => {
    const response = await request(createTestApp())
      .post('/')
      .send({ filler: 'x'.repeat(9 * 1024) })

    expect(response.status).toBe(200)
  })
})
