// Load this before the app: `node --import ./src/instrumentation.ts src/server.ts`.
// The instrumentations patch Express and `http` as they load, so they must come first.
import { register as registerLegacyHook } from 'node:module'
import {
  register as registerSyncHook,
  supportsSyncHooks,
} from 'import-in-the-middle/register-hooks.mjs'
import { loadConfig } from './config.ts'
import { startTelemetry } from './telemetry.ts'

// Express is CommonJS but our code is ESM. A loader hook lets the instrumentations patch it.
if (supportsSyncHooks()) {
  registerSyncHook()
} else {
  // Node before 24.11.1 cannot run the sync hook. Remove this branch once we require 24.11.1+.
  registerLegacyHook('@opentelemetry/instrumentation/hook.mjs', import.meta.url) // NOSONAR
}

startTelemetry(loadConfig().telemetry)
