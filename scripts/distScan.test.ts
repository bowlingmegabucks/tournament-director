import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { forbidden, scanDist } from './distScan.ts'

const dirs: string[] = []
function build(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  return dir
}

describe('scanDist', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('passes a clean build', () => {
    assert.deepEqual(scanDist(build({ 'index.html': '<p>Sign in</p>', 'assets/a.js': 'x' })), [])
  })

  for (const text of forbidden) {
    it(`finds "${text}" in a nested file`, () => {
      const dir = build({ 'assets/deep/app.js': `var a="${text}"` })
      const hits = scanDist(dir)
      assert.equal(hits.length, 1)
      assert.equal(hits[0]?.text, text)
      assert.ok(hits[0]?.file.endsWith('app.js'))
    })
  }

  it('lists every hit', () => {
    const dir = build({
      'a.js': 'adminP4sswordLocal Log in as admin',
      'b.js': 'adminP4sswordLocal',
    })
    assert.equal(scanDist(dir).length, 3)
  })
})
