import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
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
