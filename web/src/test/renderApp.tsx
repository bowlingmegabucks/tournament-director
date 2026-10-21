import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import App from '../App'

/** The whole app at `route`, with its own query client and no retries. */
export function renderApp(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
