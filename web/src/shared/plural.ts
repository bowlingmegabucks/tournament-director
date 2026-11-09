/** "1 entry", "2 entries": the count and the matching word. */
export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`
