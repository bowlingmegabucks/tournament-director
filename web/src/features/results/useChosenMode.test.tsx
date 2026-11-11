import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useChosenMode } from './useChosenMode'

function modeAt(search: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/results${search}`]}>{children}</MemoryRouter>
  )
  return renderHook(() => useChosenMode(), { wrapper }).result.current
}

describe('useChosenMode (RES-45, D-239)', () => {
  it('is the steady mode when the address says nothing', () => {
    expect(modeAt('')).toBe('full-game')
  })

  it('is live for ?mode=live, with the division beside it', () => {
    expect(modeAt('?mode=live')).toBe('live')
    expect(modeAt('?division=abc&mode=live')).toBe('live')
  })

  it('is the steady mode for ?mode=full-game and for any value it does not know', () => {
    expect(modeAt('?mode=full-game')).toBe('full-game')
    expect(modeAt('?mode=fast')).toBe('full-game')
    expect(modeAt('?mode=')).toBe('full-game')
    expect(modeAt('?mode=LIVE')).toBe('full-game')
  })
})
