// Two writes that read at once and then write deadlock under Serializable; MariaDB rolls one
// back, and Prisma reports it as P2034. The retry then sees the first write and answers as it
// should (a duplicate, a taken number).
const writeConflict = 'P2034'
const MAX_ATTEMPTS = 3

function isWriteConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === writeConflict
  )
}

// One try after another, never together: a retry has to see what the first try's rival wrote.
export async function withRetry<T>(run: () => Promise<T>, tries = 1): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isWriteConflict(error) || tries >= MAX_ATTEMPTS) throw error
    return withRetry(run, tries + 1)
  }
}
