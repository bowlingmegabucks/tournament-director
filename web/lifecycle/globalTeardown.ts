import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const compose = fileURLToPath(new URL('./docker-compose.yml', import.meta.url))

/** Remove the run's database and mail catcher. Set LIFECYCLE_KEEP=1 to inspect them afterwards. */
export default function teardown(): void {
  if (process.env.LIFECYCLE_KEEP === '1') return
  execFileSync('docker', ['compose', '-f', compose, 'down', '-v'], { stdio: 'inherit' })
}
