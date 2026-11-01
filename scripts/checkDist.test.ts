import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

function run(dir: string) {
  return spawnSync(process.execPath, ['scripts/checkDist.ts', dir], { encoding: 'utf8' })
}

describe('checkDist command', () => {
  it('exits 0 for a clean build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'))
    writeFileSync(join(dir, 'a.js'), 'clean')
    const result = run(dir)
    rmSync(dir, { recursive: true })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /no dev-only sign-in text found/)
  })

  it('exits 1 and names the file and text when a build holds a seeded password', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'))
    writeFileSync(join(dir, 'a.js'), 'adminP4sswordLocal')
    const result = run(dir)
    rmSync(dir, { recursive: true })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /a\.js contains "adminP4sswordLocal"/)
  })

  it('exits 1 when the folder does not exist', () => {
    const result = run(join(tmpdir(), 'no-such-dist-folder'))
    assert.equal(result.status, 1)
    assert.match(result.stdout, /does not exist/)
  })
})
