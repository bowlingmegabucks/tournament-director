import { setupWorker } from 'msw/browser'
import { createEventStreamHandlers, handlers } from './handlers'

// The live streams are built here, not in `handlers`: MSW needs a browser `EventSource` to make them.
export const worker = setupWorker(...handlers, ...createEventStreamHandlers())
