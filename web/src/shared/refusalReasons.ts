import { field } from './field'

/**
 * The reasons in a 409 `errors` object, in the order of `keys`. A reply with none of them gives
 * `fallback`, so the toast always says something.
 */
export function reasonsFor(errors: unknown, keys: readonly string[], fallback: string): string[] {
  const reasons = keys
    .map((key) => field(errors, key))
    .filter((reason): reason is string => typeof reason === 'string')
  return reasons.length > 0 ? reasons : [fallback]
}
