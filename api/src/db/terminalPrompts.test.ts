import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createTerminalPrompts, type TerminalInput } from './terminalPrompts.ts'

class FakeInput extends EventEmitter implements TerminalInput {
  isTTY: boolean | undefined = true
  rawMode = false
  paused = true
  setRawMode = (mode: boolean) => {
    this.rawMode = mode
  }
  setEncoding = () => undefined
  resume = () => {
    this.paused = false
  }
  pause = () => {
    this.paused = true
  }
}

function setup() {
  const input = new FakeInput()
  const written: string[] = []
  const prompts = createTerminalPrompts(input, { write: (text) => written.push(text) })
  return { input, prompts, output: () => written.join('') }
}

describe('createTerminalPrompts', () => {
  it.each([
    ['not a terminal', (input: FakeInput) => (input.isTTY = false)],
    ['no terminal flag at all', (input: FakeInput) => (input.isTTY = undefined)],
  ])('refuses to run when stdin is %s, so a password cannot be piped in', (_name, change) => {
    const input = new FakeInput()
    change(input)

    expect(() => createTerminalPrompts(input, { write: () => undefined })).toThrow(
      'Run this in a terminal',
    )
  })

  it('refuses when the input cannot switch to raw mode', () => {
    const input = new FakeInput()
    Object.assign(input, { setRawMode: undefined })

    expect(() => createTerminalPrompts(input, { write: () => undefined })).toThrow(
      'Run this in a terminal',
    )
  })

  describe('ask', () => {
    it('shows the question, echoes what is typed, and returns the line', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.ask('Email:')
      input.emit('data', 'ada@example.com\r')

      await expect(answer).resolves.toBe('ada@example.com')
      expect(output()).toBe('Email: ada@example.com\n')
    })

    it('takes keys as they come, across several chunks', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'Ad')
      input.emit('data', 'a')
      input.emit('data', '\r')

      await expect(answer).resolves.toBe('Ada')
    })

    it.each([['\r'], ['\n'], ['\u0004']])('ends the line on %j', async (key) => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', `Ada${key}`)

      await expect(answer).resolves.toBe('Ada')
    })

    it('ignores anything typed after the Enter in the same chunk', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'Ada\rleftover')

      await expect(answer).resolves.toBe('Ada')
    })

    it('lets Backspace remove the last character and rubs it out on screen', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'abc\u007fd\r')

      await expect(answer).resolves.toBe('abd')
      expect(output()).toBe('Name: abc\b \bd\n')
    })

    it('treats the other Backspace code the same', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'abc\b\r')

      await expect(answer).resolves.toBe('ab')
    })

    it('does nothing for Backspace on an empty line', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', '\u007f\u007fa\r')

      await expect(answer).resolves.toBe('a')
      expect(output()).toBe('Name: a\n')
    })

    it('removes a whole character, not half of one', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'a😀\u007f\r')

      await expect(answer).resolves.toBe('a')
    })

    it('ignores arrow keys and other control characters', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'a')
      input.emit('data', '\u001b[A')
      input.emit('data', '\tb\r')

      await expect(answer).resolves.toBe('ab')
    })

    it('accepts a space and any printable character', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', 'Ada O’Neil ~\r')

      await expect(answer).resolves.toBe('Ada O’Neil ~')
    })

    it('returns an empty line when only Enter is pressed', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      input.emit('data', '\r')

      await expect(answer).resolves.toBe('')
    })
  })

  describe('askHidden', () => {
    it('returns the line and never shows a key', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.askHidden('Password:')
      input.emit('data', 'hunter2-hunter2\r')

      await expect(answer).resolves.toBe('hunter2-hunter2')
      expect(output()).toBe('Password: \n')
      expect(output()).not.toContain('hunter2')
    })

    it('handles a pasted password in one chunk', async () => {
      const { input, prompts } = setup()

      const answer = prompts.askHidden('Password:')
      input.emit('data', 'a long pasted password\r')

      await expect(answer).resolves.toBe('a long pasted password')
    })

    it('lets Backspace edit without writing anything to the screen', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.askHidden('Password:')
      input.emit('data', 'abcd\u007f\u007fx\r')

      await expect(answer).resolves.toBe('abx')
      expect(output()).toBe('Password: \n')
    })
  })

  describe('the terminal state', () => {
    it('is raw while a question is open, and back to normal after the answer', async () => {
      const { input, prompts } = setup()

      const answer = prompts.ask('Name:')
      expect(input.rawMode).toBe(true)
      expect(input.paused).toBe(false)
      input.emit('data', 'Ada\r')
      await answer

      expect(input.rawMode).toBe(false)
      expect(input.paused).toBe(true)
      expect(input.listenerCount('data')).toBe(0)
    })

    it('cancels on Ctrl-C and still puts the terminal back', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.askHidden('Password:')
      input.emit('data', 'abc\u0003')

      await expect(answer).rejects.toThrow('Cancelled.')
      expect(input.rawMode).toBe(false)
      expect(input.paused).toBe(true)
      expect(input.listenerCount('data')).toBe(0)
      expect(output()).not.toContain('abc')
    })

    it('answers several questions in a row', async () => {
      const { input, prompts } = setup()

      const first = prompts.ask('One:')
      input.emit('data', 'a\r')
      const second = prompts.askHidden('Two:')
      input.emit('data', 'b\r')

      await expect(first).resolves.toBe('a')
      await expect(second).resolves.toBe('b')
    })
  })

  describe('confirm', () => {
    it.each(['y', 'Y', 'yes', ' YES ', 'Yes'])('takes %j as yes', async (typed) => {
      const { input, prompts } = setup()

      const answer = prompts.confirm('Go on?')
      input.emit('data', `${typed}\r`)

      await expect(answer).resolves.toBe(true)
    })

    it.each(['', 'n', 'no', 'maybe', 'yep', 'ye'])('takes %j as no', async (typed) => {
      const { input, prompts } = setup()

      const answer = prompts.confirm('Go on?')
      input.emit('data', `${typed}\r`)

      await expect(answer).resolves.toBe(false)
    })

    it('shows that the default is no', async () => {
      const { input, prompts, output } = setup()

      const answer = prompts.confirm('Go on?')
      input.emit('data', '\r')
      await answer

      expect(output()).toContain('Go on? (y/N) ')
    })
  })

  it('prints a line with a line break', () => {
    const { prompts, output } = setup()

    prompts.print('Created.')

    expect(output()).toBe('Created.\n')
  })
})
