import type { Express, Router } from 'express'

/**
 * Who may call a route group. `public` needs no sign-in. Authentication (0.3.0) adds the rest.
 * The API still enforces access on the server; the web app only hides what a user cannot use.
 */
export type Access = 'public'

const accessLabels: readonly string[] = ['public']

export interface RouteGroup {
  path: string
  access: Access
  router: Router
}

/** Every route group declares its access (D-27). A group with none, or an unknown one, stops startup. */
export function mountRoutes(app: Express, groups: RouteGroup[]): void {
  for (const { path, access, router } of groups) {
    if (!accessLabels.includes(access)) {
      throw new Error(`Route group "${path}" needs an access label`)
    }
    app.use(path, router)
  }
}
