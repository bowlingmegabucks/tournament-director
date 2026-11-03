import { metrics } from '@opentelemetry/api'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { describe, expect, it } from 'vitest'
import { createAuthFailureCounter } from './authMetrics.ts'

describe('createAuthFailureCounter', () => {
  it('gives the same counter for the same meter', () => {
    const meter = new MeterProvider().getMeter('test')

    expect(createAuthFailureCounter(meter)).toBe(createAuthFailureCounter(meter))
  })

  it('gives a separate counter to another meter', () => {
    const provider = new MeterProvider()

    expect(createAuthFailureCounter(provider.getMeter('a'))).not.toBe(
      createAuthFailureCounter(provider.getMeter('b')),
    )
  })

  it('works with the global no-op meter', () => {
    expect(() => createAuthFailureCounter(metrics.getMeter('none')).add(1)).not.toThrow()
  })
})
