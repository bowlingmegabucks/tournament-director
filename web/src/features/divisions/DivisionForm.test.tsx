import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataRouter } from '../../test/DataRouter'
import { DivisionForm, type DivisionSubmitResult } from './DivisionForm'

type Submit = (values: unknown, confirm: boolean) => Promise<DivisionSubmitResult>

function setup(options: { number?: number; onSubmit?: Submit; pending?: boolean } = {}) {
  const onSubmit = vi.fn<Submit>(options.onSubmit ?? (() => Promise.resolve(undefined)))
  const onFailure = vi.fn<(message: string) => void>()
  const onAttempt = vi.fn<() => void>()
  render(
    <DataRouter>
      <DivisionForm
        number={options.number}
        pending={options.pending ?? false}
        onSubmit={onSubmit}
        onFailure={onFailure}
        onAttempt={onAttempt}
        cancelTo="/back"
      />
    </DataRouter>,
  )
  return { onSubmit, onFailure, onAttempt, user: userEvent.setup() }
}

const add = () => screen.getByRole('button', { name: 'Add division' })
const box = (label: string) => screen.getByLabelText(label)

describe('DivisionForm', () => {
  it.each([
    ['Name (required)', '1 to 100 characters. Each name is used once in a tournament.'],
    ['Gender', 'Leave as Any gender to allow everyone.'],
    ['Minimum age', '1 to 120. Leave blank for no limit.'],
    ['Maximum age', 'Age on the tournament start date.'],
    ['Minimum average', '1 to 300. Leave blank for no limit.'],
    ['Maximum average', 'Compared with the average on the registration.'],
    ['Handicap percent', 'Type a whole number: 90 means 90 percent. 1 to 999.'],
    ['Handicap base', 'The score handicap counts up to, such as 220. 0 to 300.'],
    ['Maximum handicap per game', 'Optional. 1 to 300. Needs the percent and the base.'],
  ])('describes %s with its hint (D-144)', (label, hint) => {
    setup()

    expect(box(label)).toHaveAccessibleDescription(hint)
  })

  it('shows the number as text, with a hint that says the server assigns it (D-139)', () => {
    setup({ number: 4 })

    expect(screen.getByText('Number:')).toBeVisible()
    expect(screen.getByText('4')).toBeVisible()
    expect(
      screen.getByText(
        'Assigned when you save: one more than the highest number in this tournament.',
      ),
    ).toBeVisible()
  })

  it('shows no number and a shorter hint when it is not known (D-139)', () => {
    setup({ number: undefined })

    expect(screen.getByText('Assigned when you save.')).toBeVisible()
    expect(screen.queryByText(/one more than the highest/)).not.toBeInTheDocument()
  })

  it('asks for a numeric keypad on the number boxes, not on the name', () => {
    setup()

    expect(box('Name (required)')).not.toHaveAttribute('inputmode')
    for (const label of [
      'Minimum age',
      'Maximum age',
      'Minimum average',
      'Maximum average',
      'Handicap percent',
      'Handicap base',
      'Maximum handicap per game',
    ]) {
      expect(box(label)).toHaveAttribute('inputmode', 'numeric')
    }
  })

  it('keeps the browser from submitting the form itself, and focus where it was on a press (D-144)', () => {
    setup()

    const form = add().closest('form')
    if (!form) throw new Error('no form')
    expect(fireEvent.submit(form)).toBe(false)
    expect(fireEvent.mouseDown(add())).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('link', { name: 'Cancel' }))).toBe(false)
  })

  it('says Saving… and disables Add while it saves', () => {
    setup({ pending: true })

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('calls onAttempt on every press of Add, valid or not, and sends only a valid form (DIV-02)', async () => {
    const { user, onAttempt, onSubmit } = setup()

    await user.click(add())
    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(box('Name (required)'), 'Open')
    await user.click(add())
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Open' }), false)
  })

  it('marks a box invalid and links its message after a failed save (DIV-02)', async () => {
    const { user } = setup()

    await user.click(add())

    expect(box('Name (required)')).toHaveAttribute('aria-invalid', 'true')
    expect(box('Name (required)')).toHaveAccessibleDescription(/Name is required/)
    expect(box('Minimum age')).not.toHaveAttribute('aria-invalid')
  })

  it('counts the problems in the summary, and drops it when the last one is fixed (DIV-02)', async () => {
    const { user } = setup()
    await user.type(box('Minimum age'), '0')
    await user.click(add())
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 2 fields to save.')

    await user.type(box('Name (required)'), 'Open')
    await user.clear(box('Minimum age'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears only the message of the box being typed in (DIV-02, DIV-04)', async () => {
    const { user } = setup()
    await user.type(box('Minimum age'), '0')
    await user.click(add())
    await screen.findByRole('alert')

    await user.type(box('Name (required)'), 'Open')

    expect(box('Name (required)')).not.toHaveAttribute('aria-invalid')
    expect(box('Minimum age')).toHaveAttribute('aria-invalid', 'true')
  })

  it('moves focus from a summary link to its box', async () => {
    const { user } = setup()
    await user.type(box('Minimum age'), '0')
    await user.click(add())

    const link = within(await screen.findByRole('alert')).getByRole('link', {
      name: 'Minimum age must be between 1 and 120',
    })
    // The link points at the box; the click moves focus itself and leaves the address alone.
    expect(fireEvent.click(link)).toBe(false)

    expect(box('Minimum age')).toHaveFocus()
  })

  describe('checks on leaving a box', () => {
    it('says nothing about a box the director never typed in (DIV-02)', async () => {
      const { user } = setup()

      await user.click(box('Name (required)'))
      await user.tab()

      expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
    })

    it('does not scold the handicap base for a percent typed first (DIV-09)', async () => {
      const { user } = setup()

      await user.type(box('Handicap percent'), '90')
      await user.tab()

      expect(screen.queryByText(/Handicap base is required/)).not.toBeInTheDocument()
    })

    it('shows the minimum age message when the director leaves a smaller maximum (DIV-05)', async () => {
      const { user } = setup()
      await user.type(box('Minimum age'), '60')
      await user.tab()
      await user.type(box('Maximum age'), '40')
      await user.tab()

      expect(
        await screen.findByText('Minimum age must be less than or equal to maximum age'),
      ).toBeVisible()
    })

    it('takes that message back when the maximum is fixed (DIV-05)', async () => {
      const { user } = setup()
      await user.type(box('Minimum age'), '60')
      await user.tab()
      await user.type(box('Maximum age'), '40')
      await user.tab()
      await screen.findByText('Minimum age must be less than or equal to maximum age')

      await user.clear(box('Maximum age'))
      await user.type(box('Maximum age'), '70')
      await user.tab()

      expect(
        screen.queryByText('Minimum age must be less than or equal to maximum age'),
      ).not.toBeInTheDocument()
    })

    it('checks an untouched box once a save has failed (DIV-02)', async () => {
      const { user } = setup({
        onSubmit: () =>
          Promise.resolve({ errors: { maximumAverage: 'Too high for this tournament' } }),
      })
      await user.type(box('Name (required)'), 'Open')
      await user.click(add())
      await screen.findByRole('alert')
      expect(box('Maximum average')).toHaveAccessibleDescription(/Too high for this tournament/)

      await user.click(box('Maximum average'))
      await user.tab()

      expect(box('Maximum average')).not.toHaveAccessibleDescription(/Too high/)
    })
  })

  describe('answers from the API', () => {
    it('shows the API messages and focuses the first box in form order (D-138)', async () => {
      const { user } = setup({
        onSubmit: () =>
          Promise.resolve({
            errors: { handicapBase: 'Base is wrong', maximumAge: 'Age is wrong' },
          }),
      })
      await user.type(box('Name (required)'), 'Open')

      await user.click(add())

      await screen.findByRole('alert')
      expect(box('Handicap base')).toHaveAccessibleDescription(/Base is wrong/)
      expect(box('Maximum age')).toHaveAccessibleDescription(/Age is wrong/)
      expect(box('Maximum age')).toHaveFocus()
    })

    it('passes a failure outside the dialog to onFailure (D-143)', async () => {
      const { user, onFailure } = setup({
        onSubmit: () => Promise.resolve({ failure: 'It broke' }),
      })
      await user.type(box('Name (required)'), 'Open')

      await user.click(add())

      expect(onFailure).toHaveBeenCalledWith('It broke')
    })
  })

  describe('the confirm dialog (DIV-08, D-142)', () => {
    const warn = (field: string): Submit =>
      vi.fn<Submit>((_values, confirm) =>
        Promise.resolve(confirm ? undefined : { warnings: [{ field, message: `Check ${field}` }] }),
      )

    async function fillAndAdd(user: ReturnType<typeof userEvent.setup>, percent = '110') {
      await user.type(box('Name (required)'), 'Bonus')
      await user.type(box('Handicap percent'), percent)
      await user.type(box('Handicap base'), '220')
      await user.click(add())
    }

    it('shows the typed percent without the spaces around it', async () => {
      const { user } = setup({ onSubmit: warn('handicapPercentage') })

      await fillAndAdd(user, ' 110 ')

      const dialog = await screen.findByRole('dialog', { name: 'Add this division?' })
      expect(within(dialog).getByText('Check handicapPercentage')).toBeVisible()
      expect(within(dialog).getByText('Handicap percent: 110%')).toBeVisible()
    })

    it('shows a warning about another field with no change line', async () => {
      const { user } = setup({ onSubmit: warn('somethingNew') })

      await fillAndAdd(user)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Check somethingNew')).toBeVisible()
      expect(within(dialog).getByRole('listitem')).toHaveTextContent(/^Check somethingNew$/)
    })

    it('adds no change line for a warning about a box other than the percent', async () => {
      const { user } = setup({ onSubmit: warn('maximumAge') })

      await fillAndAdd(user)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('listitem')).toHaveTextContent(/^Check maximumAge$/)
    })

    it('removes the dialog when the director goes back, and keeps the typing', async () => {
      const { user, onSubmit } = setup({ onSubmit: warn('handicapPercentage') })
      await fillAndAdd(user)
      await screen.findByRole('dialog')

      await user.click(screen.getByRole('button', { name: 'Go back' }))

      expect(document.querySelector('dialog')).toBeNull()
      expect(box('Handicap percent')).toHaveValue('110')
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('sends again with the confirm flag when the director agrees', async () => {
      const { user, onSubmit } = setup({ onSubmit: warn('handicapPercentage') })
      await fillAndAdd(user)
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Add division' }))

      expect(onSubmit).toHaveBeenCalledTimes(2)
      expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Bonus' }), true)
    })

    it('closes the dialog and shows the field errors when the confirmed send is refused', async () => {
      let calls = 0
      const { user } = setup({
        onSubmit: () => {
          calls += 1
          return Promise.resolve(
            calls === 1
              ? { warnings: [{ field: 'handicapPercentage', message: 'Unusual' }] }
              : { errors: { name: 'That name is taken' } },
          )
        },
      })
      await fillAndAdd(user)
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Add division' }))

      await screen.findByRole('alert')
      expect(box('Name (required)')).toHaveAccessibleDescription(/That name is taken/)
      expect(document.querySelector('dialog')).toBeNull()
      expect(box('Name (required)')).toHaveFocus()
    })

    it('keeps the dialog and shows a failure inside it, not as a page toast', async () => {
      let calls = 0
      const { user, onFailure } = setup({
        onSubmit: () => {
          calls += 1
          return Promise.resolve(
            calls === 1
              ? { warnings: [{ field: 'handicapPercentage', message: 'Unusual' }] }
              : { failure: 'Database down' },
          )
        },
      })
      await fillAndAdd(user)
      const dialog = await screen.findByRole('dialog')

      await user.click(within(dialog).getByRole('button', { name: 'Add division' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Database down')
      expect(onFailure).not.toHaveBeenCalled()
    })
  })
})

describe('DivisionForm leaving with changes', () => {
  it('asks before Cancel when a box changed, and not when the form is as it started', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()

    await user.type(box('Name (required)'), 'Juniors')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }))
    expect(box('Name (required)')).toHaveValue('Juniors')
  })

  it('does not ask once the changes are typed away again', async () => {
    const { user } = setup()
    await user.type(box('Name (required)'), 'J')
    await user.clear(box('Name (required)'))

    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).not.toBeInTheDocument()
  })

  it('lets a saved form move on without asking', async () => {
    const { user, onSubmit } = setup()
    await user.type(box('Name (required)'), 'Juniors')

    await user.click(add())

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })
})
