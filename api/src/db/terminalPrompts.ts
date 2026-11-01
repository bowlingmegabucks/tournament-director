/** Questions for a person at a terminal. `askHidden` shows nothing as they type (a password). */
export interface Prompts {
  ask: (question: string) => Promise<string>
  askHidden: (question: string) => Promise<string>
  /** `y` or `yes` is true; anything else, including just Enter, is false. */
  confirm: (question: string) => Promise<boolean>
  print: (line: string) => void
}

/** The parts of `process.stdin` this needs, so a test can stand in for it. */
export interface TerminalInput {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
  setEncoding: (encoding: 'utf8') => unknown
  resume: () => unknown
  pause: () => unknown
  on: (event: 'data', listener: (chunk: string) => void) => unknown
  off: (event: 'data', listener: (chunk: string) => void) => unknown
}

export interface TerminalOutput {
  write: (text: string) => unknown
}

const enter = new Set(['\r', '\n', '\u0004'])
const interrupt = '\u0003'
const backspace = new Set(['\u007f', '\b'])
const escape = '\u001b'

/**
 * Read answers key by key, so a password is never echoed. It needs a real terminal: a password
 * piped in would land in shell history or a file. Ctrl-C cancels. Arrow keys and other escape
 * sequences are ignored. Used by the scripts in `src/db/`; not by the API.
 */
export function createTerminalPrompts(input: TerminalInput, output: TerminalOutput): Prompts {
  const setRawMode = input.setRawMode
  if (input.isTTY !== true || typeof setRawMode !== 'function') {
    throw new Error(
      'Run this in a terminal: it asks for a password that must not be echoed or piped.',
    )
  }

  function readLine(question: string, echo: boolean): Promise<string> {
    output.write(`${question} `)
    setRawMode?.call(input, true)
    input.setEncoding('utf8')
    input.resume()
    return new Promise((resolve, reject) => {
      let value: string[] = []
      const finish = (done: () => void): void => {
        input.off('data', onData)
        setRawMode?.call(input, false)
        input.pause()
        output.write('\n')
        done()
      }
      const processKey = (key: string): boolean => {
        if (enter.has(key)) return (finish(() => resolve(value.join(''))), false)
        if (key === interrupt) return (finish(() => reject(new Error('Cancelled.'))), false)
        if (backspace.has(key)) {
          if (value.length > 0 && echo) output.write('\b \b')
          value = value.slice(0, -1)
          return true
        }
        if (key >= ' ') {
          value.push(key)
          if (echo) output.write(key)
        }
        return true
      }
      const onData = (chunk: string): void => {
        if (chunk.startsWith(escape)) return
        for (const key of chunk) {
          if (!processKey(key)) return
        }
      }
      input.on('data', onData)
    })
  }

  return {
    ask: (question) => readLine(question, true),
    askHidden: (question) => readLine(question, false),
    confirm: async (question) => {
      const answer = (await readLine(`${question} (y/N)`, true)).trim().toLowerCase()
      return answer === 'y' || answer === 'yes'
    },
    print: (line) => {
      output.write(`${line}\n`)
    },
  }
}
