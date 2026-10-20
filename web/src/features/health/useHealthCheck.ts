import { useMutation } from '@tanstack/react-query'
import { checkHealth } from './api'

// A mutation, not a query: it runs when the user clicks, not when the page loads.
export function useHealthCheck() {
  return useMutation({ mutationFn: checkHealth })
}
