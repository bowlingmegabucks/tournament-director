import { describe, expect, it } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { DivisionChooser } from './DivisionChooser'
import { useChosenDivision } from './useChosenDivision'

const divisions = [
  { id: 'a', name: 'Open', entries: 12 },
  { id: 'b', name: 'Women', entries: 1 },
]

function Where() {
  const location = useLocation()
  return <output>{location.search}</output>
}

describe('DivisionChooser (D-80, D-89)', () => {
  it('lists each division with its entry count', () => {
    render(
      <MemoryRouter>
        <DivisionChooser divisions={divisions} chosenId="a" />
      </MemoryRouter>,
    )

    const list = screen.getByRole('combobox', { name: 'Division' })
    expect(list).toHaveValue('a')
    expect(screen.getByRole('option', { name: 'Open (12 entries)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Women (1 entry)' })).toBeInTheDocument()
  })

  it('shows nothing for a single division', () => {
    render(
      <MemoryRouter>
        <DivisionChooser divisions={divisions.slice(0, 1)} chosenId="a" />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps the choice in the address', async () => {
    render(
      <MemoryRouter initialEntries={['/x?keep=1']}>
        <DivisionChooser divisions={divisions} chosenId="a" />
        <Where />
      </MemoryRouter>,
    )

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Division' }), 'b')

    expect(screen.getByRole('status')).toHaveTextContent('?keep=1&division=b')
  })
})

describe('useChosenDivision', () => {
  const wrap =
    (search: string) =>
    ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[`/x${search}`]}>{children}</MemoryRouter>
    )

  it('picks the division in the address', () => {
    const { result } = renderHook(() => useChosenDivision(divisions), {
      wrapper: wrap('?division=b'),
    })

    expect(result.current?.id).toBe('b')
  })

  it.each(['', '?division=nope'])('falls back to the first for %j', (search) => {
    const { result } = renderHook(() => useChosenDivision(divisions), { wrapper: wrap(search) })

    expect(result.current?.id).toBe('a')
  })

  it('is undefined with no divisions', () => {
    const { result } = renderHook(() => useChosenDivision([]), { wrapper: wrap('') })

    expect(result.current).toBeUndefined()
  })
})
