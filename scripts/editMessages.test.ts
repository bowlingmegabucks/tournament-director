import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The edit page tells the director about locks and confirmations before they type. The API words
// the same rules again on every save (TRN-29, D-129). The two folders cannot import each other,
// so this test checks that each message still appears in both source files.
const apiPlan = readFileSync('api/src/features/tournaments/editPlan.ts', 'utf8')
const webNotes = readFileSync('web/src/features/tournaments/editNotes.ts', 'utf8')

const shared = [
  'This tournament is complete. Nothing can change.',
  'Scores are saved, so the number of games cannot change.',
  'Scores are saved, so the start date cannot change.',
  'Scores are saved. Posted results change at once.',
  'Sweeper scores are saved. Posted results change at once.',
  'They keep what they paid. New entries pay the new fee.',
  '1 bowler is registered.',
  'bowlers are registered.',
]

describe('edit messages in api and web', () => {
  for (const message of shared) {
    it(`"${message}" is in editPlan.ts and editNotes.ts`, () => {
      assert.ok(apiPlan.includes(message), 'missing from api/.../editPlan.ts')
      assert.ok(webNotes.includes(message), 'missing from web/.../editNotes.ts')
    })
  }
})
