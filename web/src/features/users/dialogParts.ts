import type { MouseEvent } from 'react'

/** A native modal <dialog> traps focus, closes on Escape, and gives focus back to its opener. */
export function showOnMount(node: HTMLDialogElement | null) {
  if (node && !node.open) node.showModal()
}

export function closeDialogOf(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest('dialog')?.close()
}
