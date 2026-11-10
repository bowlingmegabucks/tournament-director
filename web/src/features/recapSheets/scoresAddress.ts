import type { SessionKind } from '../../shared/session'

/**
 * The address the QR code on a recap sheet opens: the Scores tab of the squad or sweeper (RPT-10,
 * D-226). `origin` is the page's own origin, such as `https://example.com`.
 */
export function scoresAddress(
  origin: string,
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): string {
  return `${origin}/tournaments/${tournamentId}/${kind}s/${sessionId}/scores`
}
