/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string
  // API origin for production, where the site and the API are on different hosts. Empty in dev.
  readonly VITE_API_BASE_URL?: string
}
