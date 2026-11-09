export type Step = 1 | 2 | 3

export const stepNames: Record<Step, string> = { 1: 'Bowler', 2: 'Registration', 3: 'Review' }

/** A callback ref that moves focus when its element appears: a new step, or a new summary. */
export const focusOnMount = (node: HTMLElement | null) => {
  node?.focus()
}
