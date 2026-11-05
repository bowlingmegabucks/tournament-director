/** Does what the admin typed match the tournament's name? Trimmed, any case (D-136). */
export function nameMatches(typed: string, name: string): boolean {
  return typed.trim().toLowerCase() === name.trim().toLowerCase()
}
