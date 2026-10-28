import type { Registration } from './types'

/**
 * The registration grid's one filter box (REG-23, D-49). The text splits into words on spaces and
 * commas. A registration matches when every word starts its first name, its last name, or its
 * USBC ID, ignoring case. A blank word (from a doubled space, or no text at all) starts every
 * value, so empty text matches everyone.
 */
export function filterRegistrations(registrations: Registration[], text: string): Registration[] {
  const words = text.toLowerCase().split(/[\s,]/)
  return registrations.filter(({ bowler }) => {
    const fields = [bowler.firstName, bowler.lastName, bowler.usbcId].map((value) =>
      value.toLowerCase(),
    )
    return words.every((word) => fields.some((value) => value.startsWith(word)))
  })
}
