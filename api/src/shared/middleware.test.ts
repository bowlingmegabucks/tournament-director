import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HttpError } from './errors.ts'
import { createCapturedLogger } from '../test/logger.ts'
import { createErrorHandler } from './middleware.ts'
import type { Logger } from './logger.ts'

function appThatThrows(error: unknown, logger: Logger = createCapturedLogger().logger) {
  const app = express()
  app.get('/boom', () => {
    throw error
  })
  app.use(createErrorHandler(logger))
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
    const response = await request(appThatThrows(new Error('secret detail'))).get('/boom')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error' })
  })

  it('answers 400 with the problems when a Zod schema rejects the input', async () => {
    const schema = z.object({ name: z.string().min(3), entrants: z.number() })
    const error = schema.safeParse({ name: 'ab', entrants: 'many' }).error

    const response = await request(appThatThrows(error)).get('/boom')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message:
        'Invalid request. name: Too small: expected string to have >=3 characters; entrants: Invalid input: expected number, received string',
    })
  })

  it('names the request when the problem has no path', async () => {
    const error = z.string().safeParse(1).error

    const response = await request(appThatThrows(error)).get('/boom')

    expect(response.body).toEqual({
      message: 'Invalid request. request: Invalid input: expected string, received number',
    })
  })

  it('does not log a Zod error as a server problem', async () => {
    const { logger, records } = createCapturedLogger()

    await request(appThatThrows(z.string().safeParse(1).error, logger)).get('/boom')

    expect(records()).toEqual([])
  })

  it('names a nested field with a dotted path', async () => {
    const schema = z.object({ venue: z.object({ lanes: z.number() }) })
    const error = schema.safeParse({ venue: { lanes: 'many' } }).error

    const response = await request(appThatThrows(error)).get('/boom')

    expect(response.body).toEqual({
      message: 'Invalid request. venue.lanes: Invalid input: expected number, received string',
    })
  })

  it('hands the error to Express once the response has started', () => {
    const handler = createErrorHandler(createCapturedLogger().logger)
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() }
    const next = vi.fn()
    const error = new Error('late failure')

    handler(error, {} as express.Request, res as unknown as express.Response, next)

    expect(next).toHaveBeenCalledExactlyOnceWith(error)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('logs the cause of any other error', async () => {
    const { logger, records } = createCapturedLogger()

    await request(appThatThrows(new Error('secret detail'), logger)).get('/boom')

    expect(records()).toMatchObject([
      { level: 50, msg: 'Unhandled error', err: { message: 'secret detail' } },
    ])
  })

  it('does not log an HttpError', async () => {
    const { logger, records } = createCapturedLogger()

    await request(appThatThrows(new HttpError(404, 'Gone'), logger)).get('/boom')

    expect(records()).toEqual([])
  })
})
