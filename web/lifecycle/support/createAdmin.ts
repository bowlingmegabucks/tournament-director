import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { databaseUrl } from './stack'

const driver = fileURLToPath(new URL('./answerPrompts.py', import.meta.url))
const apiFolder = fileURLToPath(new URL('../../../api', import.meta.url))

/**
 * Make the first admin with the app's own script (`npm run users:create-admin`, D-101). The script
 * needs a terminal, so a small Python driver types the answers into a pseudo-terminal. Throws,
 * with the script's output, when it fails.
 */
export function createFirstAdmin(admin: { email: string; name: string; password: string }): void {
  const answers = [
    ['Email:', admin.email],
    ['Name:', admin.name],
    ['Password:', admin.password],
    ['Password again:', admin.password],
  ]
  try {
    execFileSync(
      'python3',
      ['-I', driver, '--', 'npm', '--prefix', apiFolder, 'run', 'users:create-admin'],
      {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          LIFECYCLE_ANSWERS: JSON.stringify(answers),
        },
        encoding: 'utf8',
        timeout: 120_000,
      },
    )
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error ? String(error.stdout) : ''
    throw new Error(`users:create-admin failed.\n${output}`, { cause: error })
  }
}
