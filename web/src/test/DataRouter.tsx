import { useState, type ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'

/**
 * A memory router that has data-router features such as `useBlocker`, which a plain
 * `<MemoryRouter>` lacks. It builds the router once, so a re-render keeps the page state.
 */
export function DataRouter({
  children,
  initialEntries = ['/'],
}: Readonly<{ children: ReactNode; initialEntries?: InitialEntry[] }>) {
  const [router] = useState(() =>
    createMemoryRouter([{ path: '*', element: children }], { initialEntries }),
  )
  return <RouterProvider router={router} />
}
