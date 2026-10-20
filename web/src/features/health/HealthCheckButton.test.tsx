import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { renderWithClient } from '../../test/renderWithClient'
import { HealthCheckButton } from './HealthCheckButton'

const checkButton = () => screen.getByRole('button', { name: 'Check API' })

describe('HealthCheckButton', () => {
  it('shows no toast before the click', () => {
    renderWithClient(<HealthCheckButton />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a success toast when the API is healthy', async () => {
    renderWithClient(<HealthCheckButton />)

    await userEvent.click(checkButton())

    expect(await screen.findByRole('status')).toHaveTextContent('API is healthy')
  })

  it('shows the error message in a toast when the check fails', async () => {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status: 503 })))
    renderWithClient(<HealthCheckButton />)

    await userEvent.click(checkButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('API health check failed (503)')
  })

  it('disables the button while it checks', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    server.use(
      http.get('/api/health', async () => {
        await gate
        return HttpResponse.json({ status: 'ok' })
      }),
    )
    renderWithClient(<HealthCheckButton />)

    await userEvent.click(checkButton())

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    finish()
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(checkButton()).toBeEnabled()
  })

  it('closes the toast when the user dismisses it', async () => {
    renderWithClient(<HealthCheckButton />)
    await userEvent.click(checkButton())
    await screen.findByRole('status')

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('closes the success toast by itself', async () => {
    renderWithClient(<HealthCheckButton successToastMs={50} />)

    await userEvent.click(checkButton())
    await screen.findByRole('status')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('keeps the error toast until the user dismisses it', async () => {
    server.use(http.get('/api/health', () => HttpResponse.error()))
    renderWithClient(<HealthCheckButton successToastMs={50} />)

    await userEvent.click(checkButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the API')
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('replaces an error toast with a success toast on the next try', async () => {
    let calls = 0
    server.use(
      http.get('/api/health', () =>
        ++calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ status: 'ok' }),
      ),
    )
    renderWithClient(<HealthCheckButton />)

    await userEvent.click(checkButton())
    await screen.findByRole('alert')
    await userEvent.click(checkButton())

    expect(await screen.findByRole('status')).toHaveTextContent('API is healthy')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
