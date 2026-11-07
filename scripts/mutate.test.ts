import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lockChangedBeyondVersion, planMutation } from './mutate.ts'

const patterns = ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/main.tsx', '!src/mocks/**']

describe('planMutation', () => {
  it('lists the changed source files', () => {
    assert.deepEqual(planMutation(['src/features/a/A.tsx', 'src/b.ts'], patterns), {
      mode: 'some',
      files: ['src/features/a/A.tsx', 'src/b.ts'],
    })
  })

  it('leaves out tests, excluded files, and files outside the patterns', () => {
    const changed = ['src/A.test.tsx', 'src/main.tsx', 'src/mocks/data.ts', 'README.md', 'src/C.ts']
    assert.deepEqual(planMutation(changed, patterns), { mode: 'some', files: ['src/C.ts'] })
  })

  it('has nothing to mutate when only tests and docs changed', () => {
    assert.deepEqual(planMutation(['src/A.test.tsx', 'docs/x.md'], patterns), { mode: 'none' })
    assert.deepEqual(planMutation([], patterns), { mode: 'none' })
  })

  for (const file of [
    'stryker.config.json',
    'package-lock.json',
    'tsconfig.app.json',
    'vitest.stryker.config.ts',
  ]) {
    it(`runs everything when ${file} changes`, () => {
      assert.deepEqual(planMutation([file, 'src/C.ts'], patterns), { mode: 'full' })
    })
  }

  it('does not treat a nested file with the same name as a config file', () => {
    assert.deepEqual(planMutation(['src/package.json'], patterns), { mode: 'none' })
  })
})

describe('lockChangedBeyondVersion', () => {
  const lock = (version: string, dep = '1.0.0') =>
    JSON.stringify({
      name: 'web',
      version,
      packages: { '': { name: 'web', version, dependencies: { a: `^${dep}` } } },
    })

  it('ignores a change to the root version only', () => {
    assert.equal(lockChangedBeyondVersion(lock('0.6.1'), lock('0.7.0')), false)
  })

  it('sees a changed dependency', () => {
    assert.equal(lockChangedBeyondVersion(lock('0.6.1'), lock('0.7.0', '2.0.0')), true)
  })

  it('treats text that is not JSON as a change', () => {
    assert.equal(lockChangedBeyondVersion('{', lock('0.7.0')), true)
  })
})
