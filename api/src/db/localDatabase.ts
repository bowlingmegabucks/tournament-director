const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Where `DATABASE_URL` points, without the user and password: `host:port/database`. */
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl)
  return `${url.host}${url.pathname}`
}

/** Whether `DATABASE_URL` points at this machine. Seeded sign-in users have known passwords, so they go only here. */
export function isLocalDatabase(databaseUrl: string): boolean {
  return URL.canParse(databaseUrl) && localHosts.has(new URL(databaseUrl).hostname)
}
