/** `rc` is the candidate number of `1.0.0-rc.2`; a final release has none. */
export type Version = readonly [major: number, minor: number, patch: number, rc?: number]

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

const pattern = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/

/** `x.y.z`, or a release candidate `x.y.z-rc.N`. No other suffix is used in this repo. */
export function parseVersion(text: string): Version | undefined {
  const match = pattern.exec(text)
  if (!match) return undefined
  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const
  return match[4] === undefined ? core : [...core, Number(match[4])]
}

/** A release candidate sorts below the final release of the same x.y.z (1.0.0-rc.9 < 1.0.0). */
export function compareVersions(a: Version, b: Version): number {
  for (const index of [0, 1, 2] as const) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  if (a[3] === b[3]) return 0
  if (a[3] === undefined) return 1
  if (b[3] === undefined) return -1
  return a[3] - b[3]
}

export function formatVersion(version: Version): string {
  const core = version.slice(0, 3).join('.')
  return version[3] === undefined ? core : `${core}-rc.${version[3]}`
}

/** The next version to suggest: the next candidate after a candidate, else the next patch. */
const nextPatch = ([major, minor, patch, rc]: Version): Version =>
  rc === undefined ? [major, minor, patch + 1] : [major, minor, patch, rc + 1]
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
  const main = base === undefined ? undefined : parseVersion(base)
  if (main && compareVersions(version, main) < 0) {
    errors.push(`Version ${api} is lower than the version on main (${base}).`)
  }
  return { errors, warnings: [] }
}

/**
 * Rules for a pull request to main.
 * - api and web carry the same `x.y.z`.
 * - A released version (a `v*` tag) is closed: the next work needs a higher one. In 0.x the
 *   suggestion is the next minor; from 1.0.0 it is the next patch.
 * - A release candidate (`1.0.0-rc.1`) sorts below the final `1.0.0`.
 * - Below main's version is always wrong. Equal to main's is fine: only a release tag closes a
 *   version.
 */
export function checkVersion({ api, web, base, latestTag }: VersionInput): VersionResult {
  const errors: string[] = []
  const apiVersion = parseVersion(api)
  const webVersion = parseVersion(web)
  if (!apiVersion)
    errors.push(`api/package.json version "${api}" must look like 1.2.3 or 1.2.3-rc.1.`)
  if (!webVersion)
    errors.push(`web/package.json version "${web}" must look like 1.2.3 or 1.2.3-rc.1.`)
  if (!apiVersion || !webVersion) return { errors, warnings: [] }
  if (compareVersions(apiVersion, webVersion) !== 0) {
    errors.push(`api (${api}) and web (${web}) must have the same version.`)
    return { errors, warnings: [] }
  }

  const releasedMessage = releasedError(apiVersion, api, latestTag)
  if (releasedMessage) return { errors: [releasedMessage], warnings: [] }

  return mainCheck(apiVersion, api, base)
}
