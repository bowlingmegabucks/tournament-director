import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imagesReady, startPrint } from './print'

type Listener = (event: { matches: boolean }) => void

let print: ReturnType<typeof vi.fn>
let matchMedia: ReturnType<typeof vi.fn>
let listeners: Listener[]

beforeEach(() => {
  print = vi.fn()
  listeners = []
  matchMedia = vi.fn(() => ({
    addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: Listener) => {
      listeners = listeners.filter((candidate) => candidate !== listener)
    },
  }))
  vi.stubGlobal('print', print)
  vi.stubGlobal('matchMedia', matchMedia)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.body.dataset.recapPrinting
  delete document.body.dataset.resultsPrinting
})

describe('startPrint (D-62, D-78)', () => {
  it('marks the page, asks about the print media, and opens the print dialog', () => {
    startPrint('recap', vi.fn())

    expect(document.body).toHaveAttribute('data-recap-printing', '')
    expect(matchMedia).toHaveBeenCalledWith('print')
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('marks the page with the name it is given, so two features do not clash (D-78)', () => {
    const end = startPrint('results', vi.fn())

    expect(document.body).toHaveAttribute('data-results-printing', '')
    expect(document.body).not.toHaveAttribute('data-recap-printing')

    end()
    expect(document.body).not.toHaveAttribute('data-results-printing')
  })

  it('ends on afterprint: clears the mark and says done once', () => {
    const done = vi.fn()
    startPrint('recap', done)

    window.dispatchEvent(new Event('afterprint'))
    window.dispatchEvent(new Event('afterprint'))

    expect(done).toHaveBeenCalledTimes(1)
    expect(document.body).not.toHaveAttribute('data-recap-printing')
    expect(listeners).toHaveLength(0)
  })

  it('ends when the print media query goes off, not when it comes on', () => {
    const done = vi.fn()
    startPrint('recap', done)

    for (const listener of listeners) listener({ matches: true })
    expect(done).not.toHaveBeenCalled()

    for (const listener of listeners) listener({ matches: false })
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('ends early when asked, and asking again does nothing more', () => {
    const done = vi.fn()
    const end = startPrint('recap', done)

    end()
    end()
    window.dispatchEvent(new Event('afterprint'))

    expect(done).toHaveBeenCalledTimes(1)
    expect(document.body).not.toHaveAttribute('data-recap-printing')
  })
})

describe('imagesReady (D-62)', () => {
  function copyWithImage() {
    const root = document.createElement('div')
    root.innerHTML =
      '<div data-recap-print-copy><img alt="" src="/a.png"></div><img alt="" src="/b.png">'
    document.body.append(root)
    return root
  }

  afterEach(() => {
    document.body.replaceChildren()
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  })

  it('waits for the images of the print copy to decode, and only those', async () => {
    const root = copyWithImage()
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    const decode = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: decode,
      configurable: true,
    })

    await imagesReady('recap', root)

    expect(decode).toHaveBeenCalledTimes(1)
  })

  it('skips an image that is already complete', async () => {
    const root = copyWithImage()
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    const decode = vi.fn(() => Promise.resolve())
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: decode,
      configurable: true,
    })

    await imagesReady('recap', root)

    expect(decode).not.toHaveBeenCalled()
  })

  it('does not wait on a browser with no decode, or on an image that fails', async () => {
    const root = copyWithImage()
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    await expect(imagesReady('recap', root)).resolves.toBeUndefined()

    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      value: () => Promise.reject(new Error('broken')),
      configurable: true,
    })
    await expect(imagesReady('recap', root)).resolves.toBeUndefined()
  })
})
