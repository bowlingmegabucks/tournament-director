/**
 * Whether the app offers sign-in. Always in development and tests. In a production build only when
 * VITE_SHOW_SIGN_IN is `true`: the cookie works only once the API is on its own subdomain under
 * the site's domain (0.4.0, D-99). Read at call time so tests can set it.
 */
export function signInEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_SIGN_IN === 'true'
}
