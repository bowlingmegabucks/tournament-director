import type { Counter, Meter } from '@opentelemetry/api'

/** Why a caller was turned away. Each value is a `reason` attribute on the failure counter. */
export type AuthFailureReason =
  'missing_credentials' | 'invalid_key' | 'forbidden' | 'bad_sign_in' | 'sign_in_throttled'

// Three places count failures; they share one instrument per meter.
const counters = new WeakMap<Meter, Counter>()

/** `tournament_director.auth.failures`: a 401 or 403 from a protected route, or a failed sign-in. */
export function createAuthFailureCounter(meter: Meter): Counter {
  const known = counters.get(meter)
  if (known) return known
  const counter = meter.createCounter('tournament_director.auth.failures', {
    description: 'Requests turned away for who they are: a 401 or 403, or a failed sign-in.',
    unit: '{request}',
  })
  counters.set(meter, counter)
  return counter
}
