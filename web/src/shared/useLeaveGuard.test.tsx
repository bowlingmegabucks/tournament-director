import { useRef, useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { LeaveDialog } from './LeaveDialog'
import { skipLeaveGuard, useLeaveGuard } from './useLeaveGuard'

/** `hold` keeps the save running until Finish is pressed, so a test can act mid-save. */
function Form({
  saveFails = false,
  hold = false,
}: Readonly<{ saveFails?: boolean; hold?: boolean }>) {
  const finish = useRef<() => void>(undefined)
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
              await new Promise<void>((resolve) => {
                finish.current = resolve
                if (!hold) resolve()
              })
              await navigate('/done')
            })
            .catch(() => undefined)
        }}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          finish.current?.()
        }}
      >
        Finish
      </button>
      <Link to="/other">Other</Link>
      <Link to="/gone" state={skipLeaveGuard}>
        Gone
      </Link>
      <LeaveDialog blocker={guard.blocker} />
    </>
  )
}

function renderForm({ saveFails = false, hold = false } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Form saveFails={saveFails} hold={hold} /> },
      { path: '/other', element: <h1>Other page</h1> },
      { path: '/done', element: <h1>Done page</h1> },
      { path: '/gone', element: <h1>Gone page</h1> },
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

  it('lets a move marked as skipping the guard go without asking (a deleted page)', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('Text'), 'abc')

    await user.click(screen.getByRole('link', { name: 'Gone' }))

    expect(screen.getByRole('heading', { name: 'Gone page' })).toBeVisible()
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
    const user = renderForm({ saveFails: true })
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

  it('does not ask the browser while a save is under way', async () => {
    const user = renderForm({ hold: true })
    await user.type(screen.getByLabelText('Text'), 'abc')
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(closing()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByRole('heading', { name: 'Done page' })).toBeVisible()
  })
})
