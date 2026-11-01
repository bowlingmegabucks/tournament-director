/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string
  // API origin for production, where the site and the API are on different hosts. `/api` in dev (.env.development), empty for mocks and tests.
  // `true` shows the Sign in link and /login in a production build. Off until the API sits on its own subdomain (0.4.0, D-99). Always on in development.
  readonly VITE_SHOW_SIGN_IN?: string
  readonly VITE_API_BASE_URL?: string
}
