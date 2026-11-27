import { ConfirmChangesDialog } from '../../shared/ConfirmChangesDialog'
import { formatPair } from './format'
import type { LanePair } from './types'

interface PairOutDialogProps {
  pair: LanePair
  onConfirm: () => void
  onClose: () => void
}

const list = new Intl.ListFormat('en')

/** Names who leaves the pair before it goes out of play (OOP-04). */
export function PairOutDialog({ pair, ...rest }: Readonly<PairOutDialogProps>) {
  const names = pair.bowlers.map((bowler) => bowler.name)
  const who = names.length > 0 ? list.format(names) : 'Anyone on this pair'
  return (
    <ConfirmChangesDialog
      title={`Take ${formatPair(pair).toLowerCase()} out of play?`}
      items={[{ field: 'inPlay', message: `${who} will move to unassigned.`, change: '' }]}
      confirmLabel="Take out of play"
      // The change shows at once, so there is no wait to show here.
      pending={false}
      closeOnConfirm
      {...rest}
    />
  )
}
