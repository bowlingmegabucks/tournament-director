import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  GameCells,
  GameHeaders,
  PlusMinusCell,
  PlusMinusHeader,
  TotalCells,
  TotalHeaders,
} from './ScoreColumns'

/** Render cells inside a one-row table, so they sit where a browser expects them. */
function inRow(cells: React.ReactNode) {
  render(
    <table>
      <tbody>
        <tr>{cells}</tr>
      </tbody>
    </table>,
  )
  return Array.from(screen.getByRole('row').children).map((cell) => cell.textContent)
}

describe('PlusMinusHeader', () => {
  it('has no visible text but a name for screen readers', () => {
    render(
      <table>
        <thead>
          <tr>
            <PlusMinusHeader />
          </tr>
        </thead>
      </table>,
    )

    expect(screen.getByRole('columnheader')).toHaveAccessibleName('Plus or minus 200 a game')
  })
})

describe('GameHeaders', () => {
  it('has G1 to Gn', () => {
    render(
      <table>
        <thead>
          <tr>
            <GameHeaders count={3} />
          </tr>
        </thead>
      </table>,
    )

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'G1',
      'G2',
      'G3',
    ])
  })
})

describe('TotalHeaders', () => {
  const headers = (handicap: boolean) => {
    const { unmount } = render(
      <table>
        <thead>
          <tr>
            <TotalHeaders handicap={handicap} />
          </tr>
        </thead>
      </table>,
    )
    const names = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    unmount()
    return names
  }

  it('is one Total with no handicap, and three columns with one', () => {
    expect(headers(false)).toEqual(['Total'])
    expect(headers(true)).toEqual(['Scratch Total', 'Total HDCP', 'HDCP Total'])
  })
})

describe('PlusMinusCell', () => {
  it('shows the total against 200 a game for the games bowled', () => {
    expect(inRow(<PlusMinusCell total={992} games={4} />)).toEqual(['+192'])
  })
})

describe('GameCells', () => {
  it('shows each score and a dash for a game after the last', () => {
    expect(inRow(<GameCells scores={[200, 210]} count={3} />)).toEqual(['200', '210', 'No game–'])
  })

  it('shows a dash for a game with no saved score between two others', () => {
    expect(inRow(<GameCells scores={[200, null, 190]} count={3} />)).toEqual([
      '200',
      'No game–',
      '190',
    ])
  })

  it('shows a 0 as a score, not as a gap', () => {
    expect(inRow(<GameCells scores={[0, 0]} count={2} />)).toEqual(['0', '0'])
  })

  it('says "Not bowled yet" once, on the first game, for a sweeper still open with no score', () => {
    expect(inRow(<GameCells scores={null} count={3} />)).toEqual(['Not bowled yet–', '–', '–'])
  })

  it('labels each cell with its game for the phone card', () => {
    render(
      <table>
        <tbody>
          <tr>
            <GameCells scores={[200, 190]} count={2} />
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getAllByRole('cell').map((cell) => cell.getAttribute('data-label'))).toEqual([
      'G1',
      'G2',
    ])
  })
})

describe('TotalCells', () => {
  it('is one Total with no handicap', () => {
    expect(inRow(<TotalCells scores={[200, 200, 200]} total={600} handicap={false} />)).toEqual([
      '600',
    ])
  })

  it('splits a total with handicap into scratch, the handicap for every game, and the total', () => {
    expect(inRow(<TotalCells scores={[200, 210, 190]} total={672} handicap />)).toEqual([
      '600',
      '72',
      '672',
    ])
  })

  it('adds only the games with a score', () => {
    expect(inRow(<TotalCells scores={[200, null, 190]} total={420} handicap />)).toEqual([
      '390',
      '30',
      '420',
    ])
  })

  it('shows dashes, hidden from screen readers, while a sweeper is open with no score', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TotalCells scores={null} total={null} handicap />
          </tr>
        </tbody>
      </table>,
    )

    const cells = screen.getAllByRole('cell')
    expect(cells).toHaveLength(3)
    for (const cell of cells) {
      expect(within(cell).getByText('–')).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
