import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QRCodeSVG } from 'qrcode.react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { setMockUser } from '../../mocks/authHandlers'
import { createRecapSheet, createRecapSheets, createSignedInUser } from '../../mocks/data'
import { renderWithClient } from '../../test/renderWithClient'
import { RecapDialog } from './RecapDialog'
import type { RecapSheets } from './types'

const path = '/v1/tournaments/:id/squads/:sessionId/recap-sheets'

const joey = createRecapSheet({
  name: 'Joey Royer',
  divisionName: 'Senior',
  position: '1A',
  cross: { staggered: ['1A', '4A', '7A'], same: ['1A', '4A', '5A'] },
})
const dana = createRecapSheet({
  name: 'Dana Ortiz',
  divisionName: 'Open',
  position: '1B',
  cross: { staggered: ['1B', '4B', '7B'], same: ['1B', '4B', '5B'] },
})
const maria = createRecapSheet({
  name: 'Maria Ortega',
  divisionName: 'Open',
  position: '3A',
  cross: { staggered: ['3A', '6A', '9A'], same: ['3A', '6A', '7A'] },
})

function serve(recap: RecapSheets) {
  server.use(http.get(path, () => HttpResponse.json(recap)))
}

const squad = createRecapSheets({ sheets: [joey, dana, maria] })

let print: ReturnType<typeof vi.fn>
/** Listeners the dialog put on the print media query, so a test can say the print ended. */
let mediaListeners: ((event: { matches: boolean }) => void)[]

beforeEach(() => {
  print = vi.fn()
  mediaListeners = []
  vi.stubGlobal('print', print)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners.push(listener)
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners = mediaListeners.filter((candidate) => candidate !== listener)
    },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete document.body.dataset.recapPrinting
})

/** Click a print button and wait for the browser's print to be asked for once more. */
async function pressPrint(name: string) {
  const before = print.mock.calls.length
  await userEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => {
    expect(print.mock.calls).toHaveLength(before + 1)
  })
}

function open(onClose = vi.fn()) {
  renderWithClient(<RecapDialog kind="squad" tournamentId="t1" sessionId="s1" onClose={onClose} />)
  return onClose
}

/** Sheets on the page: the preview of each, plus the print copy while one is made. */
const articles = () => screen.queryAllByRole('article')

async function loaded(recap = squad) {
  serve(recap)
  const onClose = open()
  await screen.findByRole('button', { name: 'Print all' })
  return onClose
}

/** Serve the sheets with a skip that the `PUT` changes, as the API stores it (D-235). */
function serveStoredSkip(stored: 'staggered' | 'same' = 'staggered') {
  const state = { skip: stored, puts: [] as unknown[], asked: 0 }
  server.use(
    http.get(path, () => {
      state.asked += 1
      return HttpResponse.json({ ...squad, skip: state.skip })
    }),
    http.put('/v1/tournaments/:id/squads/:sessionId/skip', async ({ request }) => {
      const body = (await request.json()) as { skip: 'staggered' | 'same' }
      state.puts.push(body)
      state.skip = body.skip
      return HttpResponse.json({ skip: body.skip })
    }),
  )
  return state
}

const signInDirector = () => {
  setMockUser(createSignedInUser({ roles: ['director'] }))
}

async function chooseEnabled(name: string) {
  const radio = screen.getByRole('radio', { name })
  await waitFor(() => {
    expect(radio).toBeEnabled()
  })
  return radio
}

describe('RecapDialog states', () => {
  it('shows loading while the sheets come (RPT-09)', async () => {
    server.use(http.get(path, () => new Promise(() => undefined)))

    open()

    expect(await screen.findByText('Loading recap sheets…')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Print all' })).not.toBeInTheDocument()
  })

  it('shows an error, and Try again loads the sheets (RPT-09)', async () => {
    serve(squad)
    // A missing squad is final, so it shows at once. A second request finds the sheets.
    server.use(http.get(path, () => new HttpResponse(null, { status: 404 }), { once: true }))
    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('Squad not found')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Print all' })).toBeVisible()
  })

  it('shows the setup message when the session cannot take lanes (LAN-02)', async () => {
    server.use(
      http.get(path, () =>
        HttpResponse.json(
          { message: 'Bowlers per pair must be 2 to 5 to assign lanes' },
          { status: 422 },
        ),
      ),
    )

    open()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bowlers per pair must be 2 to 5 to assign lanes',
    )
  })

  it('says so when no bowler has a lane, and offers no print (RPT-05c)', async () => {
    serve(createRecapSheets({ withoutLane: 3 }))

    open()

    expect(
      await screen.findByText(/No bowler has a lane yet, so there are no recap sheets/),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Print all' })).not.toBeInTheDocument()
    expect(screen.getByText(/3 bowlers have no lane and get no sheet\./)).toBeVisible()
  })

  it('names the session date in the title (RPT-09)', async () => {
    await loaded(
      createRecapSheets({
        sheets: [joey],
        session: { ...squad.session, date: '2026-10-24T09:00:00' },
      }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Recap sheets · Sat 10/24/2026 9:00 AM' }),
    ).toBeVisible()
  })

  it('closes from the Close button (RPT-09)', async () => {
    const onClose = await loaded()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click on the backdrop but not on a click inside (RPT-09)', async () => {
    const onClose = await loaded()
    const dialog = screen.getByRole('dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Print selected (3)' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(dialog)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when a drag ends on the backdrop (RPT-09)', async () => {
    const onClose = await loaded()
    const dialog = screen.getByRole('dialog')

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(dialog)

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('RecapDialog warning', () => {
  it('warns how many bowlers get no sheet, and why to wait (RPT-05c, D-65)', async () => {
    await loaded(createRecapSheets({ sheets: [joey, dana], withoutLane: 4 }))

    expect(
      screen.getByText(/4 bowlers have no lane and get no sheet\./).closest('output'),
    ).toHaveTextContent(
      '4 bowlers have no lane and get no sheet. The lanes in use change the cross, so print after everyone has a lane.',
    )
  })

  it('says "bowler has" for one (RPT-05c)', async () => {
    await loaded(createRecapSheets({ sheets: [joey], withoutLane: 1 }))

    expect(screen.getByText(/1 bowler has no lane and gets no sheet\./)).toBeVisible()
  })

  it('warns about a bowler with a lane but an unknown division, in its own notice (D-51, D-65)', async () => {
    await loaded(createRecapSheets({ sheets: [joey, dana], withoutDivision: 2 }))

    expect(
      screen.getByText(/2 bowlers have a lane but a division that is not in this tournament/),
    ).toBeVisible()
    expect(screen.getByText(/Those lanes are left out of the lanes in use too/)).toBeVisible()
    expect(screen.queryByText(/no lane and/)).not.toBeInTheDocument()
  })

  it('says "bowler has" and "That lane is" for one unknown division (D-51)', async () => {
    await loaded(createRecapSheets({ sheets: [joey], withoutDivision: 1 }))

    expect(
      screen.getByText(/1 bowler has a lane but a division that is not in this tournament/),
    ).toBeVisible()
    expect(screen.getByText(/That lane is left out of the lanes in use too/)).toBeVisible()
  })

  it('shows neither notice when every bowler is placed (D-51)', async () => {
    await loaded()

    expect(screen.queryByText(/division that is not in this tournament/)).not.toBeInTheDocument()
  })

  it('shows no warning when everyone has a lane (RPT-05c)', async () => {
    await loaded()

    expect(screen.queryByText(/no lane and/)).not.toBeInTheDocument()
  })

  it('says the lanes come from all bowlers with a lane, whatever is checked (D-64)', async () => {
    await loaded()

    expect(
      screen.getByText(
        /The lanes on every sheet come from all 3 bowlers with a lane, whatever is checked/,
      ),
    ).toBeVisible()
  })

  it('says "1 bowler" when one sheet exists (D-64)', async () => {
    await loaded(createRecapSheets({ sheets: [joey] }))

    expect(screen.getByText(/come from all 1 bowler with a lane/)).toBeVisible()
  })
})

describe('RecapDialog preview', () => {
  it('shows one sheet for each bowler, in the order sent (RPT-09)', async () => {
    await loaded()

    expect(articles().map((sheet) => sheet.getAttribute('aria-label'))).toEqual([
      'Recap sheet for Joey Royer',
      'Recap sheet for Dana Ortiz',
      'Recap sheet for Maria Ortega',
    ])
  })

  it('starts on the stored skip, staggered when nothing is stored (SCR-23, D-235)', async () => {
    serveStoredSkip()
    open()
    await screen.findByRole('button', { name: 'Print all' })
    expect(screen.getByRole('radio', { name: 'Staggered skip' })).toBeChecked()
    expect(screen.getAllByRole('cell', { name: '7A' })).toHaveLength(1)
  })

  it('starts on the same skip when that is stored (SCR-23, D-235)', async () => {
    serveStoredSkip('same')
    open()
    await screen.findByRole('button', { name: 'Print all' })
    expect(screen.getByRole('radio', { name: 'Same skip' })).toBeChecked()
    expect(screen.queryByRole('cell', { name: '9A' })).not.toBeInTheDocument()
  })

  it('saves the skip when it changes, and shows the sheets of the new one (SCR-23, D-64, D-235)', async () => {
    signInDirector()
    const state = serveStoredSkip()
    open()
    await screen.findByRole('button', { name: 'Print all' })
    await chooseEnabled('Same skip')

    await userEvent.click(screen.getByRole('radio', { name: 'Same skip' }))

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Same skip' })).toBeChecked()
    })
    expect(state.puts).toEqual([{ skip: 'same' }])
    expect(await screen.findByRole('cell', { name: '5A' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '9A' })).not.toBeInTheDocument()

    await userEvent.click(await chooseEnabled('Staggered skip'))

    expect(await screen.findByRole('cell', { name: '9A' })).toBeInTheDocument()
    expect(state.puts).toEqual([{ skip: 'same' }, { skip: 'staggered' }])
  })

  it('shows the pattern being saved while the save runs (SCR-23)', async () => {
    signInDirector()
    serveStoredSkip()
    server.use(
      http.put(
        '/v1/tournaments/:id/squads/:sessionId/skip',
        () => new Promise<Response>(() => undefined),
      ),
    )
    open()
    await screen.findByRole('button', { name: 'Print all' })
    await chooseEnabled('Same skip')

    await userEvent.click(screen.getByRole('radio', { name: 'Same skip' }))

    expect(screen.getByRole('radio', { name: 'Same skip' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Staggered skip' })).toBeDisabled()
  })

  it('says why when the skip cannot be saved, and keeps the stored skip (SCR-23, D-231)', async () => {
    signInDirector()
    serveStoredSkip()
    server.use(
      http.put('/v1/tournaments/:id/squads/:sessionId/skip', () =>
        HttpResponse.json(
          { message: 'This squad is complete. The skip cannot change.' },
          { status: 409 },
        ),
      ),
    )
    open()
    await screen.findByRole('button', { name: 'Print all' })
    await chooseEnabled('Same skip')

    await userEvent.click(screen.getByRole('radio', { name: 'Same skip' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This squad is complete. The skip cannot change.',
    )
    expect(screen.getByRole('radio', { name: 'Staggered skip' })).toBeChecked()
  })

  it('leaves the radios off for someone who cannot score (SCR-23, D-96)', async () => {
    setMockUser(createSignedInUser({ roles: ['director'], permissions: ['lanes.read'] }))
    const state = serveStoredSkip()
    open()
    await screen.findByRole('button', { name: 'Print all' })

    expect(screen.getByRole('radio', { name: 'Same skip' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Staggered skip' })).toBeDisabled()
    expect(state.puts).toEqual([])
  })
})

describe('RecapDialog selection (D-64)', () => {
  it('starts with every sheet checked and says Printing', async () => {
    await loaded()

    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked()
    expect(screen.getByText('3 of 3 selected')).toBeVisible()
    expect(screen.getAllByText('Printing')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Print selected (3)' })).toBeEnabled()
  })

  it('unchecking a sheet says Not printing and lowers the count', async () => {
    await loaded()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))

    expect(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' })).not.toBeChecked()
    expect(screen.getByText('Not printing')).toBeVisible()
    expect(screen.getByText('2 of 3 selected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Print selected (2)' })).toBeEnabled()
  })

  it('checking it again puts it back', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))

    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))

    expect(screen.getByText('3 of 3 selected')).toBeVisible()
    expect(screen.queryByText('Not printing')).not.toBeInTheDocument()
  })

  it('turns Print selected off when nothing is checked', async () => {
    await loaded()

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByText('0 of 3 selected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Print selected (0)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Print all' })).toBeEnabled()
  })

  it('Select all checks every sheet again', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))

    expect(screen.getByText('3 of 3 selected')).toBeVisible()
  })

  it('the box narrows the list and counts what shows (D-64)', async () => {
    await loaded()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'ort')

    expect(articles().map((sheet) => sheet.getAttribute('aria-label'))).toEqual([
      'Recap sheet for Dana Ortiz',
      'Recap sheet for Maria Ortega',
    ])
    expect(screen.getByText('Showing 2 of 3 sheets')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Select shown (2)' })).toBeEnabled()
  })

  it('says so when nothing matches, and Select shown is off', async () => {
    await loaded()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'zzz')

    expect(screen.getByText('No sheet matches that search.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Select shown (0)' })).toBeDisabled()
    expect(articles()).toHaveLength(0)
  })

  it('a filter never unchecks a sheet, and the count includes hidden checked sheets', async () => {
    await loaded()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'joey')

    expect(screen.getByText('3 of 3 selected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Print selected (3)' })).toBeEnabled()
  })

  it('Select shown checks the sheets in view and leaves the rest as they are', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'ort')

    await userEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))

    expect(screen.getByText('2 of 3 selected')).toBeVisible()
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Find a bowler' }))
    expect(screen.getByRole('checkbox', { name: 'Print Joey Royer' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' })).toBeChecked()
  })

  it('says "1 sheet" for one (D-64)', async () => {
    await loaded(createRecapSheets({ sheets: [joey] }))

    expect(screen.getByText('Showing 1 of 1 sheet')).toBeVisible()
  })
})

describe('RecapDialog printing (D-62)', () => {
  /** The print copy is the articles that sit outside the dialog. */
  const printCopy = () => articles().filter((sheet) => !sheet.closest('dialog'))

  it('Print all prints every sheet, ignoring the checks', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))
    print.mockImplementation(() => {
      expect(printCopy().map((sheet) => sheet.getAttribute('aria-label'))).toEqual([
        'Recap sheet for Joey Royer',
        'Recap sheet for Dana Ortiz',
        'Recap sheet for Maria Ortega',
      ])
    })

    await pressPrint('Print all')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('puts the QR code on every printed sheet (RPT-10, D-225)', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))
    print.mockImplementation(() => {
      const copies = printCopy()
      expect(copies).toHaveLength(2)
      for (const sheet of copies) {
        expect(within(sheet).getByText('Squad scores')).toBeInTheDocument()
      }
    })

    await pressPrint('Print selected (2)')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('Print selected prints only the checked sheets (D-64)', async () => {
    await loaded()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Dana Ortiz' }))
    print.mockImplementation(() => {
      expect(printCopy().map((sheet) => sheet.getAttribute('aria-label'))).toEqual([
        'Recap sheet for Joey Royer',
        'Recap sheet for Maria Ortega',
      ])
    })

    await pressPrint('Print selected (2)')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('prints a checked sheet that the search hides (D-64)', async () => {
    await loaded()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'joey')
    print.mockImplementation(() => {
      expect(printCopy()).toHaveLength(3)
    })

    await pressPrint('Print selected (3)')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('a sheet prints the same lanes whichever sheets are checked (D-64)', async () => {
    await loaded()
    const lanesOf = (sheet: HTMLElement) =>
      within(sheet)
        .getAllByRole('row')
        .slice(1, -1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent)
    let printedAll: (string | null | undefined)[] = []
    let printedOne: (string | null | undefined)[] = []
    print.mockImplementationOnce(() => {
      printedAll = lanesOf(printCopy()[2] as HTMLElement)
    })
    await pressPrint('Print all')
    window.dispatchEvent(new Event('afterprint'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Print Maria Ortega' }))
    print.mockImplementationOnce(() => {
      printedOne = lanesOf(printCopy()[0] as HTMLElement)
    })

    await pressPrint('Print selected (1)')

    expect(printedAll).toEqual(['3A', '6A', '9A'])
    expect(printedOne).toEqual(printedAll)
  })

  it('prints the skip pattern on screen (D-64)', async () => {
    signInDirector()
    serveStoredSkip()
    open()
    await screen.findByRole('button', { name: 'Print all' })
    await userEvent.click(await chooseEnabled('Same skip'))
    await screen.findByRole('cell', { name: '5A' })
    print.mockImplementation(() => {
      expect(within(printCopy()[2] as HTMLElement).getByRole('cell', { name: '7A' })).toBeVisible()
    })

    await pressPrint('Print all')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('marks the page while printing and puts everything back after (D-62)', async () => {
    await loaded()
    print.mockImplementation(() => {
      expect(document.body).toHaveAttribute('data-recap-printing')
    })

    await pressPrint('Print all')
    expect(printCopy()).toHaveLength(3)

    window.dispatchEvent(new Event('afterprint'))

    await waitFor(() => {
      expect(printCopy()).toHaveLength(0)
    })
    expect(document.body).not.toHaveAttribute('data-recap-printing')
  })
})

describe('RecapDialog edges', () => {
  it('has a plain title while the sheets load (RPT-09)', async () => {
    server.use(http.get(path, () => new Promise(() => undefined)))

    open()

    expect(await screen.findByRole('dialog', { name: 'Recap sheets' })).toBeVisible()
  })

  it('does not say "No sheet matches" when something matches (D-64)', async () => {
    await loaded()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a bowler' }), 'joey')

    expect(screen.queryByText('No sheet matches that search.')).not.toBeInTheDocument()
  })

  it('does not close on a click that began inside the box (RPT-09)', async () => {
    const onClose = await loaded()
    const dialog = screen.getByRole('dialog')

    fireEvent.mouseDown(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Print all' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close on a click that has no press before it (RPT-09)', async () => {
    const onClose = await loaded()

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('marks the page with an empty flag while printing (D-62)', async () => {
    await loaded()
    print.mockImplementation(() => {
      expect(document.body.dataset.recapPrinting).toBe('')
    })

    await pressPrint('Print all')

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('listens for the end of one print only, so a later print is its own (D-62)', async () => {
    await loaded()
    const remove = vi.spyOn(window, 'removeEventListener')
    await pressPrint('Print all')
    window.dispatchEvent(new Event('afterprint'))
    expect(remove).toHaveBeenCalledWith('afterprint', expect.any(Function))
    await pressPrint('Print all')

    expect(document.body).toHaveAttribute('data-recap-printing')
    window.dispatchEvent(new Event('afterprint'))
    expect(document.body).not.toHaveAttribute('data-recap-printing')
  })
})

describe('RecapDialog retries (RPT-09)', () => {
  it('tries a failing request once more, then shows the error', async () => {
    let asked = 0
    server.use(
      http.get(path, () => {
        asked += 1
        return new HttpResponse(null, { status: 503 })
      }),
    )

    open()

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Failed to load recap sheets (503)',
    )
    expect(asked).toBe(2)
  })

  it('does not retry a missing squad', async () => {
    let asked = 0
    server.use(
      http.get(path, () => {
        asked += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )

    open()

    await screen.findByRole('alert')
    expect(asked).toBe(1)
  })

  it('does not retry a session that cannot take lanes', async () => {
    let asked = 0
    server.use(
      http.get(path, () => {
        asked += 1
        return HttpResponse.json({ message: 'Bowlers per pair must be 2 to 5' }, { status: 422 })
      }),
    )

    open()

    await screen.findByRole('alert')
    expect(asked).toBe(1)
  })
})

describe('RecapDialog print safety (D-62)', () => {
  const printCopy = () => articles().filter((sheet) => !sheet.closest('dialog'))

  /** jsdom has no image decoding, so give the sponsor image one that the test controls. */
  function holdImages() {
    // Every sheet in the print copy has its own image, so each one gets its own wait.
    const waiting: (() => void)[] = []
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          waiting.push(resolve)
        }),
    )
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: decode,
      configurable: true,
    })
    return {
      decode,
      release: () => {
        for (const resolve of waiting) resolve()
      },
    }
  }

  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  })

  it('waits for the sponsor image before it asks the browser to print', async () => {
    await loaded()
    const images = holdImages()

    await userEvent.click(screen.getByRole('button', { name: 'Print all' }))
    await waitFor(() => {
      expect(images.decode).toHaveBeenCalled()
    })
    expect(print).not.toHaveBeenCalled()
    expect(document.body).not.toHaveAttribute('data-recap-printing')

    images.release()
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1)
    })
    expect(document.body).toHaveAttribute('data-recap-printing')
  })

  it('prints even when an image cannot be decoded', async () => {
    await loaded()
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: () => Promise.reject(new Error('broken image')),
      configurable: true,
    })

    await pressPrint('Print all')
  })

  it('ends the print when the print media query goes off, as a cancelled dialog may do', async () => {
    await loaded()
    await pressPrint('Print all')
    expect(printCopy()).toHaveLength(3)

    for (const listener of mediaListeners) listener({ matches: true })
    expect(document.body).toHaveAttribute('data-recap-printing')

    for (const listener of mediaListeners) listener({ matches: false })

    await waitFor(() => {
      expect(printCopy()).toHaveLength(0)
    })
    expect(document.body).not.toHaveAttribute('data-recap-printing')
    expect(mediaListeners).toHaveLength(0)
  })

  it('takes the page out of print mode when the dialog goes away mid-print', async () => {
    serve(squad)
    const { unmount } = renderWithClient(
      <RecapDialog kind="squad" tournamentId="t1" sessionId="s1" onClose={vi.fn()} />,
    )
    await screen.findByRole('button', { name: 'Print all' })
    await pressPrint('Print all')
    expect(document.body).toHaveAttribute('data-recap-printing')

    unmount()

    expect(document.body).not.toHaveAttribute('data-recap-printing')
    expect(mediaListeners).toHaveLength(0)
  })

  it('ignores a second click while the first print is under way', async () => {
    await loaded()
    await pressPrint('Print all')

    await userEvent.click(screen.getByRole('button', { name: 'Print selected (3)' }))
    await Promise.resolve()

    expect(print).toHaveBeenCalledTimes(1)
    expect(printCopy()).toHaveLength(3)
  })
})

describe('RecapDialog QR code (RPT-10, D-225, D-226)', () => {
  it('shows one "Squad scores" code per sheet in the preview', async () => {
    await loaded()

    expect(screen.getAllByText('Squad scores')).toHaveLength(3)
  })

  it('shows the code on a complete squad too', async () => {
    await loaded({ ...squad, session: { ...squad.session, complete: true }, sheets: [joey, dana] })

    expect(screen.getAllByText('Squad scores')).toHaveLength(2)
  })

  it("encodes this squad's Scores address on this site", async () => {
    await loaded(createRecapSheets({ sheets: [joey] }))

    const { container } = render(
      <QRCodeSVG
        value={`${window.location.origin}/tournaments/t1/squads/s1/scores`}
        level="M"
        marginSize={4}
        fgColor="#000000"
        bgColor="#ffffff"
      />,
    )
    const shown = screen.getByRole('article').querySelector('svg')
    expect(shown?.innerHTML).toBe(container.querySelector('svg')?.innerHTML)
  })
})
