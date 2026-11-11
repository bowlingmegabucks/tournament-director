/** Where the lifecycle stack listens. Separate ports, like production's separate origins. */
export const apiUrl = 'http://localhost:3100'
export const webUrl = 'http://localhost:4273'
export const mailUrl = 'http://localhost:15425'
export const databaseUrl = 'mariadb://lifecycle:lifecycle4money@localhost:15406/lifecycle'

/** The API's settings (rule 9): no mocks, a rate limit the run never meets, real mail. */
export const apiEnv = {
  PORT: '3100',
  DATABASE_URL: databaseUrl,
  API_KEY: 'lifecycle_apiKey_thisIsForTestingOnly',
  AUTH_SECRET: 'lifecycle_authSecret_thisIsForTestingOnly',
  AUTH_BASE_URL: apiUrl,
  CORS_ORIGIN: webUrl,
  SMTP_HOST: 'localhost',
  SMTP_PORT: '15125',
  SMTP_SECURE: 'false',
  SMTP_ALLOW_SELF_SIGNED: 'true',
  SMTP_USER: 'local',
  SMTP_PASSWORD: 'local',
  MAIL_FROM: 'Tournament Director <noreply@lifecycle.test>',
  WEB_BASE_URL: webUrl,
  RATE_LIMIT_MAX: '1000000',
  LIVE_RATE_LIMIT_MAX: '1000000',
  TRUST_PROXY: '0',
  LOG_LEVEL: 'warn',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
  APPLICATIONINSIGHTS_CONNECTION_STRING: '',
}

/** The production web build, with sign-in on and pointed at the test API. */
export const webBuildEnv = {
  VITE_SHOW_SIGN_IN: 'true',
  VITE_API_BASE_URL: apiUrl,
}
