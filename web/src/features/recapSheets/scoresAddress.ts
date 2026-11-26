import type { SessionKind } from '../../shared/session'

/**
 * The address the QR code on a recap sheet opens: the Scores tab of the squad or sweeper (RPT-10,
 * D-226). `origin` is the page's own origin, such as `https://example.com`. `base` is the folder the
 * app sits in, with a slash at each end: `import.meta.env.BASE_URL`, `/` locally and
 * `/tournament-director/` in production.
 */
export function scoresAddress(
  origin: string,
  base: string,
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): string {
  return `${origin}${base}tournaments/${tournamentId}/${kind}s/${sessionId}/scores`
}
