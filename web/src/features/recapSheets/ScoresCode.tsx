import { QRCodeSVG } from 'qrcode.react'
import type { SessionKind } from '../../shared/session'
import styles from './ScoresCode.module.css'

interface ScoresCodeProps {
  address: string
  kind: SessionKind
}

const captions: Record<SessionKind, string> = {
  squad: 'Squad scores',
  sweeper: 'Sweeper scores',
}

/**
 * The QR code on a recap sheet (RPT-10, D-225): a phone opens the session's Scores tab. It is
 * decoration for a camera, so a screen reader skips it; the caption names it. The colors are
 * literal because an SVG `fill` attribute may not resolve a CSS variable, and a scan fails with the
 * wrong contrast. They match `--color-ink` and `--color-paper` (a sheet is paper in both themes).
 */
export function ScoresCode({ address, kind }: Readonly<ScoresCodeProps>) {
  return (
    <figure className={styles.root}>
      <QRCodeSVG
        className={styles.code}
        value={address}
        level="M"
        marginSize={4}
        fgColor="#000000"
        bgColor="#ffffff"
        aria-hidden="true"
      />
      <figcaption className={styles.caption}>{captions[kind]}</figcaption>
    </figure>
  )
}
