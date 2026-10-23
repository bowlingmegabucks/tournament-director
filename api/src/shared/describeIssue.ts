/** One line per validation problem: `path: message`, with nested paths joined by dots. */
export function describeIssue(issue: { path: PropertyKey[]; message: string }): string {
  return `${issue.path.map(String).join('.')}: ${issue.message}`
}
