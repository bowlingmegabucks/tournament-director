// Load this before the app: `node --import ./src/instrumentation.ts src/server.ts`.
// The instrumentations patch Express and `http` as they load, so they must come first.
import { register } from 'node:module'
import { loadConfig } from './config.ts'
import { startTelemetry } from './telemetry.ts'

// Express is CommonJS but our code is ESM. This hook lets the instrumentations patch it.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)

startTelemetry(loadConfig().telemetry)
