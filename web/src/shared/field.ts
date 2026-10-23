/** Read one key of a value of unknown shape, so a response can be checked before it is trusted. */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}
