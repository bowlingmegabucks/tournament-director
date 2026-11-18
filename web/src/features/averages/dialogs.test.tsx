import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createAverageRow } from '../../mocks/data'
import { server } from '../../mocks/server'
import { AdjustDialog } from './AdjustDialog'
import { AverageDetailsDialog } from './AverageDetailsDialog'
import { AverageDetailsFor } from './AverageDetailsFor'
import { ConfirmAverageDialog } from './ConfirmAverageDialog'
import { averageKeys, useRemoveCheck, useSaveCheck } from './useAverages'
import { renderHook } from '@testing-library/react'

const check = '/v1/tournaments/t1/registrations/r1/average-check'

function withClient(
  ui: ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const adjusted = createAverageRow({
  registrationId: 'r1',
  bowlerName: 'Bill Tran',
  providedAverage: 175,
  averageInUse: 182,
  status: 'adjusted',
  note: 'USBC book average',
  verifiedBy: 'Dana Reyes',
  verifiedAt: '2026-11-17T21:12:00.000Z',
})

describe('AverageDetailsDialog (AVG-11)', () => {
  it('shows provided, verified, why, and who and when for an adjusted average', () => {
    render(<AverageDetailsDialog row={adjusted} onClose={() => undefined} />)

    const dialog = screen.getByRole('dialog', { name: 'Average: Bill Tran' })
    expect(within(dialog).getByText('Provided').nextElementSibling).toHaveTextContent('175')
    expect(within(dialog).getByText('Verified').nextElementSibling).toHaveTextContent('182')
    expect(within(dialog).getByText('Why').nextElementSibling).toHaveTextContent(
      'USBC book average',
    )
    expect(within(dialog).getByText('By').nextElementSibling).toHaveTextContent(
      /Dana Reyes, 11\/17\/26/,
    )
  })

  it('says Used, with no reason, for a verified average, and None for no average', () => {
    render(
      <AverageDetailsDialog
        row={createAverageRow({
          status: 'verified',
          providedAverage: null,
          averageInUse: null,
          verifiedBy: null,
        })}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText('Used')).toBeVisible()
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
    expect(screen.queryByText('Why')).not.toBeInTheDocument()
    expect(screen.queryByText('By')).not.toBeInTheDocument()
    expect(screen.getAllByText('None')).toHaveLength(2)
  })

  it('closes with its button', async () => {
    const onClose = vi.fn()
    render(<AverageDetailsDialog row={adjusted} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })
})

describe('AverageDetailsFor (AVG-11)', () => {
  const serve = (rows = [adjusted]) =>
    server.use(
      http.get('/v1/tournaments/t1/averages', () =>
        HttpResponse.json({ rows, tournamentComplete: false }),
      ),
    )

  it('shows nothing until the list arrives, then the details of that registration', async () => {
    serve([createAverageRow({ registrationId: 'other' }), adjusted])

    withClient(
      <AverageDetailsFor tournamentId="t1" registrationId="r1" onClose={() => undefined} />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'Average: Bill Tran' })).toBeVisible()
  })

  it('shows nothing for a registration the list does not hold', async () => {
    serve([createAverageRow({ registrationId: 'other' })])

    withClient(
      <AverageDetailsFor tournamentId="t1" registrationId="r1" onClose={() => undefined} />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('says why the list failed, and closes when the message is dismissed', async () => {
    server.use(
      http.get('/v1/tournaments/t1/averages', () => new HttpResponse(null, { status: 403 })),
    )
    const onClose = vi.fn()

    withClient(<AverageDetailsFor tournamentId="t1" registrationId="r1" onClose={onClose} />)

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'You do not have permission to check averages.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ConfirmAverageDialog (AVG-06, D-294)', () => {
  it('shows the warning, confirms, and cancels', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmAverageDialog
        message="Bill Tran already has scores."
        pending={false}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Change results?' })
    expect(within(dialog).getByText('Bill Tran already has scores.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change anyway' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables both buttons and says Saving… while it saves', () => {
    render(
      <ConfirmAverageDialog
        message="x"
        pending
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

describe('AdjustDialog (AVG-04, AVG-05)', () => {
  const setup = (row = adjusted) => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    withClient(<AdjustDialog tournamentId="t1" row={row} onClose={onClose} onSaved={onSaved} />)
    const dialog = screen.getByRole('dialog', { name: 'Adjust average: Bill Tran' })
    return {
      onSaved,
      onClose,
      dialog,
      average: within(dialog).getByLabelText('Verified average'),
      note: within(dialog).getByLabelText(/Why was it adjusted/),
      save: () =>
        userEvent.click(
          within(dialog).getByRole('button', { name: /^(Save adjusted average|Adjust anyway)$/ }),
        ),
    }
  }

  it('starts blank for a bowler with no average, and names the division and the provided average', () => {
    const { dialog, average } = setup(
      createAverageRow({
        bowlerName: 'Bill Tran',
        providedAverage: null,
        averageInUse: null,
        note: null,
      }),
    )

    expect(average).toHaveValue('')
    expect(within(dialog).getByText(/Handicap A · provided none/)).toBeVisible()
  })

  it('counts the note against its limit', async () => {
    const { note, dialog } = setup(createAverageRow({ bowlerName: 'Bill Tran', note: null }))

    await userEvent.type(note, 'abc')

    expect(within(dialog).getByText('Required. 3 of 500 characters.')).toBeVisible()
  })

  it('sends a trimmed number and closes after saving', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(check, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    const { average, save, onClose, onSaved } = setup()

    await userEvent.clear(average)
    await userEvent.type(average, ' 190 ')
    await save()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(onSaved).toHaveBeenCalledWith(adjusted)
    expect(bodies).toEqual([{ action: 'adjust', average: 190, note: 'USBC book average' }])
  })

  it('sends null for a blank average box', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(check, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    const { average, save } = setup()

    await userEvent.clear(average)
    await save()

    await waitFor(() => {
      expect(bodies).toHaveLength(1)
    })
    expect(bodies[0]).toMatchObject({ average: null })
  })

  it('focuses the average when it is wrong, the note when only the note is, and clears the old errors', async () => {
    let fail: Record<string, string> | undefined = { average: 'Bad average' }
    server.use(
      http.put(check, () =>
        fail
          ? HttpResponse.json({ message: 'x', errors: fail }, { status: 400 })
          : HttpResponse.json({}),
      ),
    )
    const { average, note, save, dialog } = setup()

    await save()
    expect(await within(dialog).findByText('Bad average')).toBeVisible()
    expect(average).toHaveFocus()

    fail = { note: 'Bad note' }
    await save()
    expect(await within(dialog).findByText('Bad note')).toBeVisible()
    expect(within(dialog).queryByText('Bad average')).not.toBeInTheDocument()
    expect(note).toHaveFocus()
    expect(note).toHaveAccessibleDescription('Bad note')
  })

  it('shows the warning, takes it back when the director edits, and sends the confirm once', async () => {
    const bodies: { confirmWarnings?: boolean }[] = []
    server.use(
      http.put(check, async ({ request }) => {
        const body = (await request.json()) as { confirmWarnings?: boolean }
        bodies.push(body)
        return body.confirmWarnings
          ? HttpResponse.json({})
          : HttpResponse.json({ message: 'Has scores', warnings: [{}] }, { status: 409 })
      }),
    )
    const { average, note, save, dialog, onClose } = setup()

    await save()
    expect(await within(dialog).findByText('Has scores')).toBeVisible()
    await userEvent.type(average, '1')
    expect(within(dialog).queryByText('Has scores')).not.toBeInTheDocument()
    await save()
    expect(await within(dialog).findByText('Has scores')).toBeVisible()
    await userEvent.type(note, '!')
    expect(within(dialog).queryByText('Has scores')).not.toBeInTheDocument()
    await save()
    await within(dialog).findByText('Has scores')
    await save()

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(bodies.map((body) => body.confirmWarnings === true)).toEqual([false, false, false, true])
  })

  it('says why a refusal or a failure happened, in the dialog', async () => {
    server.use(
      http.put(check, () =>
        HttpResponse.json({ message: 'This tournament is complete.' }, { status: 409 }),
      ),
    )
    const { save, dialog } = setup()

    await save()

    expect(await within(dialog).findByText('This tournament is complete.')).toBeVisible()
  })

  it('shows Saving… and disables Cancel while the save is out', async () => {
    server.use(
      http.put(check, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json({})
      }),
    )
    const { save, dialog } = setup()

    await save()

    expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

describe('the save and remove hooks (AVG-19, D-298)', () => {
  it('ask again for everything of the tournament after a save and after a removal', async () => {
    server.use(
      http.put(check, () => HttpResponse.json({})),
      http.delete(check, () => HttpResponse.json({})),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(averageKeys.list('t1'), { rows: [], tournamentComplete: false })
    client.setQueryData(averageKeys.list('t2'), { rows: [], tournamentComplete: false })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const save = renderHook(() => useSaveCheck('t1'), { wrapper })
    const remove = renderHook(() => useRemoveCheck('t1'), { wrapper })

    await save.result.current.mutateAsync({
      registrationId: 'r1',
      change: { action: 'verify' },
      confirm: false,
    })
    expect(client.getQueryState(averageKeys.list('t1'))?.isInvalidated).toBe(true)
    client.setQueryData(averageKeys.list('t1'), { rows: [], tournamentComplete: false })
    await remove.result.current.mutateAsync({ registrationId: 'r1', confirm: false })

    expect(client.getQueryState(averageKeys.list('t1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(averageKeys.list('t2'))?.isInvalidated).toBe(false)
  })
})
