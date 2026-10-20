import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// One retry keeps a failed request from showing "Loading…" for several seconds.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

// VITE_USE_MOCKS=true serves random data from the browser instead of calling the API.
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledFrame: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}

function render() {
  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element in index.html')

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

// If mocks fail to start, still render the app so the user sees the API error.
try {
  await enableMocking()
} catch (error: unknown) {
  console.error('Mocking failed to start', error)
}
render()
