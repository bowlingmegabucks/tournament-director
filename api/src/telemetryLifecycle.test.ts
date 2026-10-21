import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfig } from './test/factories.ts'

// A fake SDK, so the test sees the calls without starting real exporters.
const sdk = vi.hoisted(() => ({
  start: vi.fn<() => void>(),
  shutdown: vi.fn(() => Promise.resolve()),
}))

vi.mock('@opentelemetry/sdk-node', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opentelemetry/sdk-node')>()),
  NodeSDK: class {
    start = sdk.start
    shutdown = sdk.shutdown
  },
}))

const { shutdownTelemetry, startTelemetry } = await import('./telemetry.ts')

const withDestination = {
  ...createConfig().telemetry,
  otlpEndpoint: 'http://localhost:15341/ingest/otlp',
}

afterEach(async () => {
  await shutdownTelemetry()
  vi.clearAllMocks()
})

describe('startTelemetry', () => {
  it('starts the SDK once when a destination is set', () => {
    startTelemetry(withDestination)

    expect(sdk.start).toHaveBeenCalledTimes(1)
  })

  it('starts nothing without a destination', () => {
    startTelemetry({ ...withDestination, otlpEndpoint: undefined })

    expect(sdk.start).not.toHaveBeenCalled()
  })
})

describe('startTelemetry called twice', () => {
  it('shuts the first SDK down before it starts the second', async () => {
    startTelemetry(withDestination)
    startTelemetry(withDestination)

    expect(sdk.start).toHaveBeenCalledTimes(2)
    expect(sdk.shutdown).toHaveBeenCalledTimes(1)
    await shutdownTelemetry()
    expect(sdk.shutdown).toHaveBeenCalledTimes(2)
  })
})

describe('startTelemetry when the SDK fails to start', () => {
  it('throws, and leaves nothing to shut down', async () => {
    sdk.start.mockImplementationOnce(() => {
      throw new Error('bad start')
    })

    expect(() => {
      startTelemetry(withDestination)
    }).toThrow('bad start')
    await shutdownTelemetry()

    expect(sdk.shutdown).not.toHaveBeenCalled()
  })
})

describe('shutdownTelemetry', () => {
  it('shuts the running SDK down', async () => {
    startTelemetry(withDestination)

    await shutdownTelemetry()

    expect(sdk.shutdown).toHaveBeenCalledTimes(1)
  })

  it('shuts it down only once, however often it is called', async () => {
    startTelemetry(withDestination)

    await shutdownTelemetry()
    await shutdownTelemetry()

    expect(sdk.shutdown).toHaveBeenCalledTimes(1)
  })

  it('does nothing when telemetry never started', async () => {
    await shutdownTelemetry()

    expect(sdk.shutdown).not.toHaveBeenCalled()
  })
})
