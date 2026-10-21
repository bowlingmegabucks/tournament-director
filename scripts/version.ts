export type Version = readonly [major: number, minor: number, patch: number]

export interface VersionInput {
  /** `version` in api/package.json */
  api: string
  /** `version` in web/package.json */
  web: string
  /** `version` on the base branch (main). Leave out when it cannot be read. */
  base?: string
  /** The newest release tag, such as `v0.1.0`. Leave out when there is none. */
  latestTag?: string
}

export interface VersionResult {
  errors: string[]
  warnings: string[]
}

const pattern = /^(\d+)\.(\d+)\.(\d+)$/

/** Plain `x.y.z` only. Pre-release suffixes are not used in this repo. */
export function parseVersion(text: string): Version | undefined {
  const match = pattern.exec(text)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(a: Version, b: Version): number {
  for (const index of [0, 1, 2] as const) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

export function formatVersion(version: Version): string {
  return version.join('.')
}

const nextPatch = ([major, minor, patch]: Version): Version => [major, minor, patch + 1]
const nextMinor = ([major, minor]: Version): Version => [major, minor + 1, 0]

/** Error text when the version is not above the newest release, else undefined. */
function releasedError(version: Version, api: string, latestTag?: string): string | undefined {
  const released = latestTag === undefined ? undefined : parseVersion(latestTag.replace(/^v/, ''))
  if (!released || compareVersions(version, released) > 0) return undefined
  const suggestion = version[0] === 0 ? nextMinor(released) : nextPatch(released)
  return `Version ${api} is already released (${latestTag}). Set api and web to a higher version, such as ${formatVersion(suggestion)}.`
}

function mainCheck(version: Version, api: string, base: string | undefined): VersionResult {
  const errors: string[] = []
  const warnings: string[] = []
  const main = base === undefined ? undefined : parseVersion(base)
  if (!main) return { errors, warnings }

  const order = compareVersions(version, main)
  if (order < 0) {
    errors.push(`Version ${api} is lower than the version on main (${base}).`)
  } else if (order === 0) {
    const message = `Version ${api} is the same as on main. Consider bumping to ${formatVersion(nextPatch(version))}.`
    ;(version[0] === 0 ? warnings : errors).push(message)
  }
  return { errors, warnings }
}

/**
 * Rules for a pull request to main.
 * - api and web carry the same `x.y.z`.
 * - A released version (a `v*` tag) is closed: the next work needs a higher one. In 0.x the
 *   suggestion is the next minor; from 1.0.0 it is the next patch.
 * - Below main's version is always wrong. Equal to main's is a suggestion to bump in 0.x and an
 *   error from 1.0.0.
 */
export function checkVersion({ api, web, base, latestTag }: VersionInput): VersionResult {
  const errors: string[] = []
  const apiVersion = parseVersion(api)
  const webVersion = parseVersion(web)
  if (!apiVersion) errors.push(`api/package.json version "${api}" must look like 1.2.3.`)
  if (!webVersion) errors.push(`web/package.json version "${web}" must look like 1.2.3.`)
  if (!apiVersion || !webVersion) return { errors, warnings: [] }
  if (compareVersions(apiVersion, webVersion) !== 0) {
    errors.push(`api (${api}) and web (${web}) must have the same version.`)
    return { errors, warnings: [] }
  }

  const releasedMessage = releasedError(apiVersion, api, latestTag)
  if (releasedMessage) return { errors: [releasedMessage], warnings: [] }

  return mainCheck(apiVersion, api, base)
}
