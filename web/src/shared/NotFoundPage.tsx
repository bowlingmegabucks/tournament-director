import { Link } from 'react-router'
import { Page } from './Page'

/** Any address the app has no page for (NAV-03). */
export function NotFoundPage() {
  return (
    <Page>
      <title>Page not found · Tournament Director</title>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <p>
        <Link to="/">Go to Home</Link>
      </p>
    </Page>
  )
}
