import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { LeaveDialog } from './LeaveDialog'
import { useLeaveGuard } from './useLeaveGuard'

function Form({ saveFails = false }: Readonly<{ saveFails?: boolean }>) {
  const [text, setText] = useState('')
  const guard = useLeaveGuard(text !== '')
  const navigate = useNavigate()
  return (
    <>
      <h1>Form</h1>
      <input aria-label="Text" value={text} onChange={(event) => setText(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          void guard
            .whileSaving(async () => {
              if (saveFails) throw new Error('refused')
              await navigate('/done')
            })
            .catch(() => undefined)
        }}
      >
        Save
      </button>
      <Link to="/other">Other</Link>
      <LeaveDialog blocker={guard.blocker} />
    </>
  )
}

function renderForm(saveFails = false) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Form saveFails={saveFails} /> },
      { path: '/other', element: <h1>Other page</h1> },
      { path: '/done', element: <h1>Done page</h1> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return userEvent.setup()
}

const dialog = () => screen.queryByRole('dialog', { name: 'Leave without saving?' })

describe('useLeaveGuard and LeaveDialog', () => {
  it('lets a form with no changes go without asking', async () => {
    const user = renderForm()

    await user.click(screen.getByRole('link', { name: 'Other' }))

    expect(screen.getByRole('heading', { name: 'Other page' })).toBeVisible()
  })

  it('asks when the form has changes, and Stay keeps the page and the text', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')

    await user.click(screen.getByRole('link', { name: 'Other' }))

    expect(dialog()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }))
    expect(dialog()).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Form' })).toBeVisible()
    expect(screen.getByLabelText('Text')).toHaveValue('abc')
  })

  it('treats the dialog closing on its own (Escape) as Stay', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')
    await user.click(screen.getByRole('link', { name: 'Other' }))

    act(() => {
      screen.getByRole('dialog').dispatchEvent(new Event('close'))
    })

    expect(dialog()).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Form' })).toBeVisible()
  })

  it('goes on to the other page when the director picks Leave', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')
    await user.click(screen.getByRole('link', { name: 'Other' }))

    await user.click(screen.getByRole('button', { name: 'Leave page' }))

    expect(screen.getByRole('heading', { name: 'Other page' })).toBeVisible()
  })

  it('does not ask again after the changes are undone', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')
    await user.clear(screen.getByLabelText('Text'))

    await user.click(screen.getByRole('link', { name: 'Other' }))

    expect(screen.getByRole('heading', { name: 'Other page' })).toBeVisible()
  })

  it('lets a save move on without asking', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Done page' })).toBeVisible()
  })

  it('asks again after a save that failed', async () => {
    const user = renderForm(true)
    await user.type(screen.getByLabelText('Text'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await user.click(screen.getByRole('link', { name: 'Other' }))

    expect(dialog()).toBeInTheDocument()
  })

  it('asks the browser to confirm closing the tab while there are changes', async () => {
    const user = renderForm()
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(closing()).toBe(false)

    await user.type(screen.getByLabelText('Text'), 'abc')
    expect(closing()).toBe(true)

    await user.clear(screen.getByLabelText('Text'))
    expect(closing()).toBe(false)
  })
})
