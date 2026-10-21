// Load this before the app: `node --import ./src/instrumentation.ts src/server.ts`.
// The instrumentations patch Express and `http` as they load, so they must come first.
import { register } from 'import-in-the-middle/register-hooks.mjs'
import { loadConfig } from './config.ts'
import { startTelemetry } from './telemetry.ts'

// Express is CommonJS but our code is ESM. A loader hook lets the instrumentations patch it.
// This needs Node 24.11.1 or later (see `engines`); on older Node `register` throws.
register()

startTelemetry(loadConfig().telemetry)
