import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import type { Choice, EntryKey, Preview } from './types'

const base = ({ tournamentId, squadId, registrationId }: NoShowTarget) =>
  `/v1/tournaments/${encodeURIComponent(tournamentId)}/squads/${encodeURIComponent(squadId)}/no-shows/${encodeURIComponent(registrationId)}`

export interface NoShowTarget extends EntryKey {
  tournamentId: string
}

/** The API refused the change (409 with `errors`). Confirming cannot override it. */
export class NoShowRefusedError extends Error {}

/** What the admin reviewed is out of date (409 with `preview`). Nothing was saved. */
export class NoShowChangedError extends Error {
  readonly preview: Preview

  constructor(message: string, preview: Preview) {
    super(message)
    this.preview = preview
  }
}

function isPreview(value: unknown): value is Preview {
  return (
    typeof field(value, 'bowlerName') === 'string' &&
    typeof field(value, 'version') === 'string' &&
    typeof field(value, 'deletesRegistration') === 'boolean' &&
    ['warnings', 'changes', 'keepAdvancing', 'atLarge', 'payouts'].every((key) =>
      Array.isArray(field(value, key)),
    )
  )
}

async function post(url: string, body: unknown): Promise<Response> {
  const response = await apiFetch(apiUrl(url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.ok) return response
  if (response.status === 401) throw new Error('Sign in to change this entry.')
  if (response.status === 403) throw new Error('Only an admin can move or refund a no-show.')
  // Stryker disable next-line ArrowFunction: `null` and `undefined` both fail the checks below.
  const answer: unknown = await response.json().catch(() => null)
  const message = field(answer, 'message')
  const text =
    typeof message === 'string' ? message : `Failed to change the entry (${response.status})`
  const preview = field(answer, 'preview')
  if (response.status === 409 && isPreview(preview)) throw new NoShowChangedError(text, preview)
  if (response.status === 409) throw new NoShowRefusedError(text)
  throw new Error(text)
}

/** What the change would do (NSH-09). Saves nothing. */
export async function previewNoShow(target: NoShowTarget, choice: Choice): Promise<Preview> {
  const response = await post(`${base(target)}/preview`, choice)
  const body = await readJson(response, 'Failed to check the change')
  const preview = field(body, 'preview')
  if (!isPreview(preview)) throw new Error('Failed to check the change (unexpected response)')
  return preview
}

/** Save the reviewed change. `version` is the preview's. */
export async function applyNoShow(
  target: NoShowTarget,
  choice: Choice,
  version: string,
): Promise<void> {
  await post(base(target), { ...choice, version })
}
