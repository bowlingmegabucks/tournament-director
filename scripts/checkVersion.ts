// Run by CI on pull requests to main, and by hand: `npm run check:version`.
// Compares the version in api/ and web/ with main and with the newest release tag.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { checkVersion, compareVersions, parseVersion } from './version.ts'

function versionOf(json: string): string | undefined {
  const parsed: unknown = JSON.parse(json)
  const version =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined
  return typeof version === 'string' ? version : undefined
}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function baseVersion(ref: string): string | undefined {
  try {
    return versionOf(git('show', `${ref}:api/package.json`))
  } catch {
    return undefined
  }
}

function latestReleaseTag(): string | undefined {
  let newest: { tag: string; version: NonNullable<ReturnType<typeof parseVersion>> } | undefined
  for (const tag of git('tag', '--list', 'v*').split('\n')) {
    const version = parseVersion(tag.trim().replace(/^v/, ''))
    if (version && (!newest || compareVersions(version, newest.version) > 0)) {
      newest = { tag: tag.trim(), version }
    }
  }
  return newest?.tag
}

const baseFlag = process.argv.indexOf('--base')
const baseRef = baseFlag === -1 ? 'origin/main' : (process.argv[baseFlag + 1] ?? 'origin/main')

const api = versionOf(readFileSync('api/package.json', 'utf8'))
const web = versionOf(readFileSync('web/package.json', 'utf8'))
const base = baseVersion(baseRef)
const latestTag = latestReleaseTag()

const { errors, warnings } = checkVersion({
  api: api ?? '',
  web: web ?? '',
  base,
  latestTag,
})

const inActions = process.env.GITHUB_ACTIONS === 'true'
for (const message of errors) {
  console.log(inActions ? `::error title=Version::${message}` : `error: ${message}`)
}
for (const message of warnings) {
  console.log(inActions ? `::warning title=Version::${message}` : `warning: ${message}`)
}
if (base === undefined)
  console.log(`note: could not read the version on ${baseRef}; skipped that check.`)
if (errors.length === 0) {
  console.log(
    `Version ${api}: ok (main ${base ?? 'unknown'}, latest release ${latestTag ?? 'none'}).`,
  )
}
process.exit(errors.length > 0 ? 1 : 0)
