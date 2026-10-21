import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'
import { trace } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConfig } from './test/factories.ts'
import { createTelemetryOptions } from './telemetry.ts'

// The Azure exporter is built on OpenTelemetry 2.x and the app uses the 3.x SDK. Nothing else in
// the suite sends data through the real exporters, so this test exports one span to a local server that stands in for Application Insights.

let server: Server
let bodies: string[] = []
let endpoint = ''

let certDir = ''
let rejectUnauthorized: string | undefined

beforeAll(async () => {
  // The exporter only speaks HTTPS, so the stand-in needs a throwaway self-signed certificate.
  certDir = mkdtempSync(join(tmpdir(), 'export-test-'))
  const key = join(certDir, 'key.pem')
  const cert = join(certDir, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
    ].concat(['-keyout', key, '-out', cert]),
    { stdio: 'ignore' },
  )
  rejectUnauthorized = process.env['NODE_TLS_REJECT_UNAUTHORIZED']
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
  server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      const body = req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw
      bodies.push(body.toString('utf8'))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ itemsReceived: 1, itemsAccepted: 1, errors: [] }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  endpoint = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}/`
})

afterAll(() => {
  if (rejectUnauthorized === undefined) delete process.env['NODE_TLS_REJECT_UNAUTHORIZED']
  else process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = rejectUnauthorized
  server.close()
  rmSync(certDir, { recursive: true, force: true })
})

describe('export to Application Insights', () => {
  it('sends a span through the real exporters', async () => {
    bodies = []
    const options = createTelemetryOptions({
      ...createConfig().telemetry,
      appInsightsConnectionString: `InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=${endpoint}`,
    })
    const sdk = new NodeSDK({ ...options, instrumentations: [] })
    sdk.start()

    trace.getTracer('export-test').startSpan('export-test-span').end()
    await sdk.shutdown()

    expect(bodies.join('\n')).toContain('export-test-span')
  })
})
