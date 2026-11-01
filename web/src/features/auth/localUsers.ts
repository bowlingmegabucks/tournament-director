/** The seeded local users (D-104). Same list as `api/src/db/seedUsers.ts`. Imported only by the dev-only quick-login buttons. */
export const localUsers = [
  { label: 'Log in as admin', email: 'admin@example.com', password: 'adminP4sswordLocal' },
  {
    label: 'Log in as tournament director',
    email: 'director@example.com',
    password: 'directorP4sswordLocal',
  },
  {
    label: 'Log in as score keeper',
    email: 'scorekeeper@example.com',
    password: 'scoreKeeperP4sswordLocal',
  },
] as const
