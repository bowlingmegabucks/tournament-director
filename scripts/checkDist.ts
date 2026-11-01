import { existsSync } from 'node:fs'
import { scanDist } from './distScan.ts'

// Run after a production build: `node scripts/checkDist.ts web/dist` (D-104).
const dir = process.argv[2] ?? 'web/dist'
if (!existsSync(dir)) {
  console.log(`error: ${dir} does not exist. Build the web app first.`)
  process.exit(1)
}

const hits = scanDist(dir)
const inActions = process.env.GITHUB_ACTIONS === 'true'
for (const hit of hits) {
  const message = `${hit.file} contains "${hit.text}".`
  console.log(inActions ? `::error title=Dev-only text in build::${message}` : `error: ${message}`)
}
if (hits.length === 0) console.log(`${dir}: no dev-only sign-in text found.`)
process.exit(hits.length > 0 ? 1 : 0)
