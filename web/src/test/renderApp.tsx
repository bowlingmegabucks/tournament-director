import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, parsePath } from 'react-router'
import App from '../App'

/** The whole app at `route` (with router `state`, when a page reads it), with its own query client and no retries. */
export function renderApp(route: string, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[state === undefined ? route : { ...parsePath(route), state }]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
