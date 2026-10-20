import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from './errors.ts'
import { errorHandler } from './middleware.ts'

function appThatThrows(error: unknown) {
  const app = express()
  app.get('/boom', () => {
    throw error
  })
  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  it('sends the status and message of an HttpError', async () => {
    const response = await request(appThatThrows(new HttpError(409, 'Already registered'))).get(
      '/boom',
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'Already registered' })
  })

  it('hides the message of any other error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await request(appThatThrows(new Error('secret detail'))).get('/boom')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
    log.mockRestore()
  })
})
