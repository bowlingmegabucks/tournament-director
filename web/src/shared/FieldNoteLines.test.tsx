import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldNoteLines } from './FieldNoteLines'

describe('FieldNoteLines (D-185)', () => {
  it('draws nothing without a note', () => {
    const { container } = render(<FieldNoteLines id="date" note={undefined} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing for an empty note', () => {
    const { container } = render(<FieldNoteLines id="date" note={{}} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('labels a limit with words and gives it the id "<id>-limit"', () => {
    render(<FieldNoteLines id="lanes" note={{ limit: 'Lanes 1 to 18 have bowlers assigned' }} />)

    const line = screen.getByText('Lanes 1 to 18 have bowlers assigned', { exact: false })
    expect(line).toHaveTextContent('Limit: Lanes 1 to 18 have bowlers assigned')
    expect(line).toHaveAttribute('id', 'lanes-limit')
  })

  it('labels a lock and gives it the id "<id>-lock"', () => {
    render(<FieldNoteLines id="games" note={{ lock: 'A score exists' }} />)

    const line = screen.getByText('A score exists', { exact: false })
    expect(line).toHaveTextContent('Locked: A score exists')
    expect(line).toHaveAttribute('id', 'games-lock')
  })

  it('labels a confirmation and gives it the id "<id>-confirm"', () => {
    render(<FieldNoteLines id="fee" note={{ confirm: 'Bowlers are entered' }} />)

    const line = screen.getByText('Bowlers are entered', { exact: false })
    expect(line).toHaveTextContent('Asks you to confirm: Bowlers are entered')
    expect(line).toHaveAttribute('id', 'fee-confirm')
  })

  it('draws every line a note holds', () => {
    render(<FieldNoteLines id="x" note={{ limit: 'a', lock: 'b', confirm: 'c' }} />)

    expect(screen.getAllByText(/Limit:|Locked:|Asks you to confirm:/)).toHaveLength(3)
  })
})
