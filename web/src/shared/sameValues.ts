/** Whether two form values hold the same text, numbers, lists, and records. Key order does not matter. */
export function sameValues(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameValues(item, b[index]))
    )
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && sameValues(Reflect.get(a, key), Reflect.get(b, key)),
    )
  )
}
