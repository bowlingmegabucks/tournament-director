import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkVersion, compareVersions, formatVersion, parseVersion } from './version.ts'

const ok = { errors: [], warnings: [] }

describe('parseVersion', () => {
  it('reads x.y.z', () => {
    assert.deepEqual(parseVersion('0.2.10'), [0, 2, 10])
  })

  it('reads a release candidate', () => {
    assert.deepEqual(parseVersion('1.0.0-rc.12'), [1, 0, 0, 12])
  })

  for (const text of [
    '',
    '1.2',
    '1.2.3.4',
    'v1.2.3',
    '1.2.3-beta.1',
    '1.2.3-rc',
    '1.2.3-rc.',
    '1.2.3-rc.1.2',
    '01.2.x',
    ' 1.2.3',
  ]) {
    it(`rejects "${text}"`, () => {
      assert.equal(parseVersion(text), undefined)
    })
  }
})

describe('compareVersions', () => {
  it('compares major, then minor, then patch, and numbers not text', () => {
    assert.ok(compareVersions([1, 0, 0], [0, 9, 9]) > 0)
    assert.ok(compareVersions([0, 3, 0], [0, 2, 9]) > 0)
    assert.ok(compareVersions([0, 2, 10], [0, 2, 9]) > 0)
    assert.ok(compareVersions([0, 2, 1], [0, 2, 2]) < 0)
    assert.equal(compareVersions([0, 2, 1], [0, 2, 1]), 0)
  })

  it('formats back to text', () => {
    assert.equal(formatVersion([0, 2, 0]), '0.2.0')
    assert.equal(formatVersion([1, 0, 0, 3]), '1.0.0-rc.3')
  })

  it('sorts candidates by number, below the final release', () => {
    assert.ok(compareVersions([1, 0, 0, 10], [1, 0, 0, 9]) > 0)
    assert.ok(compareVersions([1, 0, 0, 1], [1, 0, 0]) < 0)
    assert.ok(compareVersions([1, 0, 0], [1, 0, 0, 99]) > 0)
    assert.ok(compareVersions([1, 0, 0, 1], [0, 10, 0]) > 0)
    assert.equal(compareVersions([1, 0, 0, 2], [1, 0, 0, 2]), 0)
  })
})

describe('checkVersion', () => {
  it('passes a bump above main and the latest tag', () => {
    assert.deepEqual(
      checkVersion({
        api: '0.2.1',
        web: '0.2.1',
        base: '0.2.0',
        latestTag: 'v0.1.0',
      }),
      ok,
    )
  })

  it('passes when the version is the same as main and not tagged', () => {
    const result = checkVersion({
      api: '1.0.0-rc.1',
      web: '1.0.0-rc.1',
      base: '1.0.0-rc.1',
      latestTag: 'v0.9.0',
    })

    assert.deepEqual(result, { errors: [], warnings: [] })
  })

  it('fails when the version is lower than main', () => {
    const result = checkVersion({ api: '0.2.0', web: '0.2.0', base: '0.2.1' })

    assert.deepEqual(result.errors, ['Version 0.2.0 is lower than the version on main (0.2.1).'])
  })

  it('fails on a released version in 0.x and suggests the next minor', () => {
    const result = checkVersion({
      api: '0.2.0',
      web: '0.2.0',
      base: '0.2.0',
      latestTag: 'v0.2.0',
    })

    assert.deepEqual(result.errors, [
      'Version 0.2.0 is already released (v0.2.0). Set api and web to a higher version, such as 0.3.0.',
    ])
    assert.deepEqual(result.warnings, [])
  })

  it('fails on a version below the latest tag', () => {
    const result = checkVersion({
      api: '0.0.0',
      web: '0.0.0',
      base: '0.0.0',
      latestTag: 'v0.1.0',
    })

    assert.equal(result.errors.length, 1)
    assert.match(result.errors[0] ?? '', /already released \(v0\.1\.0\).*0\.2\.0/)
  })

  it('suggests the next patch after a release from 1.0.0', () => {
    const result = checkVersion({
      api: '1.2.0',
      web: '1.2.0',
      base: '1.2.0',
      latestTag: 'v1.2.0',
    })

    assert.match(result.errors[0] ?? '', /such as 1\.2\.1\./)
  })

  it('passes the first version after a release tag, such as 0.3.0 after v0.2.0', () => {
    assert.deepEqual(
      checkVersion({
        api: '0.3.0',
        web: '0.3.0',
        base: '0.2.0',
        latestTag: 'v0.2.0',
      }),
      ok,
    )
  })

  it('fails when api and web differ', () => {
    const result = checkVersion({ api: '0.2.0', web: '0.2.1', base: '0.1.0' })

    assert.deepEqual(result.errors, ['api (0.2.0) and web (0.2.1) must have the same version.'])
  })

  it('fails on a version that is not x.y.z, for each package', () => {
    const result = checkVersion({ api: '0.2', web: 'next' })

    assert.deepEqual(result.errors, [
      'api/package.json version "0.2" must look like 1.2.3 or 1.2.3-rc.1.',
      'web/package.json version "next" must look like 1.2.3 or 1.2.3-rc.1.',
    ])
  })

  it('skips the main check when main cannot be read', () => {
    assert.deepEqual(checkVersion({ api: '0.2.0', web: '0.2.0', latestTag: 'v0.1.0' }), ok)
  })

  it('skips the main check when main has an odd version', () => {
    assert.deepEqual(checkVersion({ api: '0.2.0', web: '0.2.0', base: 'x' }), ok)
  })

  it('skips the tag check when there is no tag or the tag is not a version', () => {
    assert.deepEqual(checkVersion({ api: '0.0.1', web: '0.0.1', base: '0.0.0' }), ok)
    assert.deepEqual(
      checkVersion({
        api: '0.0.1',
        web: '0.0.1',
        base: '0.0.0',
        latestTag: 'vnext',
      }),
      ok,
    )
  })

  it('reads a tag written without the v', () => {
    const result = checkVersion({
      api: '0.1.0',
      web: '0.1.0',
      latestTag: '0.1.0',
    })

    assert.equal(result.errors.length, 1)
  })

  describe('release candidates', () => {
    it('passes the next candidate above main and the newest candidate tag', () => {
      assert.deepEqual(
        checkVersion({
          api: '1.0.0-rc.2',
          web: '1.0.0-rc.2',
          base: '1.0.0-rc.1',
          latestTag: 'v1.0.0-rc.1',
        }),
        ok,
      )
    })

    it('passes the first candidate after the last 0.x release', () => {
      assert.deepEqual(
        checkVersion({
          api: '1.0.0-rc.1',
          web: '1.0.0-rc.1',
          base: '0.10.0',
          latestTag: 'v0.9.0',
        }),
        ok,
      )
    })

    it('fails on a tagged candidate and suggests the next one', () => {
      const result = checkVersion({
        api: '1.0.0-rc.1',
        web: '1.0.0-rc.1',
        latestTag: 'v1.0.0-rc.1',
      })

      assert.match(result.errors[0] ?? '', /such as 1\.0\.0-rc\.2\./)
    })

    it('fails on a candidate below main', () => {
      const result = checkVersion({ api: '1.0.0-rc.1', web: '1.0.0-rc.1', base: '1.0.0-rc.2' })

      assert.deepEqual(result.errors, [
        'Version 1.0.0-rc.1 is lower than the version on main (1.0.0-rc.2).',
      ])
    })

    it('fails on a candidate once the final release is tagged', () => {
      const result = checkVersion({
        api: '1.0.0-rc.5',
        web: '1.0.0-rc.5',
        latestTag: 'v1.0.0',
      })

      assert.match(result.errors[0] ?? '', /already released \(v1\.0\.0\).*1\.0\.1/)
    })

    it('passes the final release after its candidates', () => {
      assert.deepEqual(
        checkVersion({
          api: '1.0.0',
          web: '1.0.0',
          base: '1.0.0-rc.4',
          latestTag: 'v1.0.0-rc.4',
        }),
        ok,
      )
    })
  })
})
