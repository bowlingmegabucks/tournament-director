import { afterEach, describe, expect, it, vi } from 'vitest'
import { maxPasswordLength, minPasswordLength } from '../shared/auth/createAuth.ts'
import { permissionsOf } from '../shared/auth/roles.ts'
import { createTestAuth, createTestUser, signInCookie, testPassword } from '../test/testAuth.ts'
import { createAdminUser } from './createAdminUser.ts'
import type { Prompts } from './terminalPrompts.ts'

interface Script {
  /** Answers to `ask`, in order. */
  visible?: string[]
  /** Answers to `askHidden`, in order. */
  hidden?: string[]
  /** Answers to `confirm`, in order. */
  confirms?: boolean[]
}

/** Prompts that answer from a script and keep what was shown, so a test can read it. */
function scripted({ visible = [], hidden = [], confirms = [] }: Script) {
  const queues = { visible: [...visible], hidden: [...hidden], confirms: [...confirms] }
  const printed: string[] = []
  const asked: string[] = []
  const hiddenAsked: string[] = []
  const prompts: Prompts = {
    ask: (question) => {
      asked.push(question)
      return Promise.resolve(queues.visible.shift() ?? '')
    },
    askHidden: (question) => {
      hiddenAsked.push(question)
      return Promise.resolve(queues.hidden.shift() ?? '')
    },
    confirm: (question) => {
      asked.push(question)
      return Promise.resolve(queues.confirms.shift() ?? false)
    },
    print: (line) => {
      printed.push(line)
    },
  }
  return { prompts, printed, asked, hiddenAsked }
}

const good = {
  visible: ['ada@example.com', 'Ada Admin'],
  hidden: [testPassword, testPassword],
}

afterEach(() => {
  vi.restoreAllMocks()
})

function world() {
  const test = createTestAuth()
  return { ...test, countUsers: () => Promise.resolve(test.database.user.length) }
}

describe('createAdminUser', () => {
  it('makes an admin who can sign in with the password typed (D-101)', async () => {
    const { auth, database, countUsers } = world()
    const { prompts } = scripted(good)

    const created = await createAdminUser({ auth, countUsers, prompts })

    expect(created).toEqual({ id: database.user[0]?.['id'], email: 'ada@example.com' })
    expect(database.user[0]).toMatchObject({ role: 'admin', name: 'Ada Admin' })
    const cookie = await signInCookie(auth, 'ada@example.com')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(permissionsOf(session?.user.role)).toContain('users.manage')
  })

  it('asks for the password without showing it, and the email and name with', async () => {
    const { auth, countUsers } = world()
    const { prompts, asked, hiddenAsked } = scripted(good)

    await createAdminUser({ auth, countUsers, prompts })

    expect(asked).toEqual(['Email:', 'Name:'])
    expect(hiddenAsked).toEqual(['Password:', 'Password again:'])
  })

  it('prints the email it made, and never the password', async () => {
    const { auth, countUsers } = world()
    const { prompts, printed } = scripted(good)

    await createAdminUser({ auth, countUsers, prompts })

    expect(printed).toEqual([
      'Created admin ada@example.com. Sign in with the password you just typed.',
    ])
    expect(printed.join('\n')).not.toContain(testPassword)
  })

  it('trims the email and name, and lowercases the email', async () => {
    const { auth, database, countUsers } = world()
    const { prompts } = scripted({
      visible: ['  Ada@Example.COM ', '  Ada Admin  '],
      hidden: [testPassword, testPassword],
    })

    await createAdminUser({ auth, countUsers, prompts })

    expect(database.user[0]).toMatchObject({ email: 'ada@example.com', name: 'Ada Admin' })
  })

  it('does not ask whether to go on when there are no users', async () => {
    const { auth, countUsers } = world()
    const { prompts, asked } = scripted(good)

    await createAdminUser({ auth, countUsers, prompts })

    expect(asked).not.toContain('Create another admin?')
  })

  describe('when users exist already', () => {
    async function withOne() {
      const w = world()
      await createTestUser(w.auth, { email: 'first@example.com' })
      return w
    }

    it.each([
      [1, 'The database already has 1 user.'],
      [2, 'The database already has 2 users.'],
    ])('says how many (%i) and asks before adding another', async (count, line) => {
      const w = await withOne()
      if (count === 2) await createTestUser(w.auth, { email: 'second@example.com' })
      const { prompts, printed, asked } = scripted({ ...good, confirms: [true] })

      await createAdminUser({ auth: w.auth, countUsers: w.countUsers, prompts })

      expect(printed[0]).toBe(line)
      expect(asked[0]).toBe('Create another admin?')
    })

    it('stops and creates nothing when the answer is no', async () => {
      const w = await withOne()
      const { prompts, printed, asked } = scripted({ ...good, confirms: [false] })

      const created = await createAdminUser({ auth: w.auth, countUsers: w.countUsers, prompts })

      expect(created).toBeNull()
      expect(w.database.user).toHaveLength(1)
      expect(printed).toContain('Nothing created.')
      expect(asked).toEqual(['Create another admin?'])
    })

    it('goes on when the answer is yes', async () => {
      const w = await withOne()
      const { prompts } = scripted({ ...good, confirms: [true] })

      const created = await createAdminUser({ auth: w.auth, countUsers: w.countUsers, prompts })

      expect(created?.email).toBe('ada@example.com')
      expect(w.database.user).toHaveLength(2)
    })
  })

  describe('the email', () => {
    it('is asked again after one that is not an email', async () => {
      const { auth, countUsers } = world()
      const { prompts, printed } = scripted({
        visible: ['not-an-email', 'ada@example.com', 'Ada'],
        hidden: [testPassword, testPassword],
      })

      const created = await createAdminUser({ auth, countUsers, prompts })

      expect(created?.email).toBe('ada@example.com')
      expect(printed).toContain('That is not an email address.')
    })

    it('stops after three wrong answers and creates nothing', async () => {
      const { auth, database, countUsers } = world()
      const { prompts, printed } = scripted({ visible: ['a', 'b@', 'c.com', 'ada@example.com'] })

      await expect(createAdminUser({ auth, countUsers, prompts })).rejects.toThrow(
        'Too many wrong answers. Nothing was created.',
      )
      expect(database.user).toHaveLength(0)
      expect(printed.filter((line) => line === 'That is not an email address.')).toHaveLength(3)
    })
  })

  describe('the name', () => {
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['over 255 characters', 'x'.repeat(256)],
    ])('is asked again when %s', async (_why, bad) => {
      const { auth, countUsers } = world()
      const { prompts, printed } = scripted({
        visible: ['ada@example.com', bad, 'Ada'],
        hidden: [testPassword, testPassword],
      })

      const created = await createAdminUser({ auth, countUsers, prompts })

      expect(created).not.toBeNull()
      expect(printed).toContain('The name needs 1 to 255 characters.')
    })

    it('accepts 255 characters', async () => {
      const { auth, database, countUsers } = world()
      const { prompts } = scripted({
        visible: ['ada@example.com', 'x'.repeat(255)],
        hidden: [testPassword, testPassword],
      })

      await createAdminUser({ auth, countUsers, prompts })

      expect(String(database.user[0]?.['name'])).toHaveLength(255)
    })

    it('stops after three wrong answers', async () => {
      const { auth, database, countUsers } = world()
      const { prompts } = scripted({ visible: ['ada@example.com', '', ' ', ''] })

      await expect(createAdminUser({ auth, countUsers, prompts })).rejects.toThrow(
        'Too many wrong answers',
      )
      expect(database.user).toHaveLength(0)
    })
  })

  describe('the password', () => {
    it.each([
      ['one character short', 'x'.repeat(minPasswordLength - 1)],
      ['empty', ''],
      ['over the longest allowed', 'x'.repeat(maxPasswordLength + 1)],
    ])('is refused when %s, with the allowed length in the message', async (_why, bad) => {
      const { auth, countUsers } = world()
      const { prompts, printed } = scripted({
        visible: good.visible,
        hidden: [bad, testPassword, testPassword],
      })

      const created = await createAdminUser({ auth, countUsers, prompts })

      expect(created).not.toBeNull()
      expect(printed).toContain(
        `The password needs ${minPasswordLength} to ${maxPasswordLength} characters.`,
      )
    })

    it.each([minPasswordLength, maxPasswordLength])('accepts %i characters', async (length) => {
      const { auth, countUsers } = world()
      const password = 'x'.repeat(length)
      const { prompts } = scripted({ visible: good.visible, hidden: [password, password] })

      const created = await createAdminUser({ auth, countUsers, prompts })

      expect(created).not.toBeNull()
      await expect(signInCookie(auth, 'ada@example.com', password)).resolves.toContain(
        'session_token',
      )
    })

    it('does not ask for the second copy of a password that is already too short', async () => {
      const { auth, countUsers } = world()
      const { prompts, hiddenAsked } = scripted({
        visible: good.visible,
        hidden: ['short', testPassword, testPassword],
      })

      await createAdminUser({ auth, countUsers, prompts })

      expect(hiddenAsked).toEqual(['Password:', 'Password:', 'Password again:'])
    })

    it('asks both again when the two copies differ', async () => {
      const { auth, countUsers } = world()
      const { prompts, printed } = scripted({
        visible: good.visible,
        hidden: [testPassword, 'a different password!', testPassword, testPassword],
      })

      const created = await createAdminUser({ auth, countUsers, prompts })

      expect(created).not.toBeNull()
      expect(printed).toContain('The two passwords differ.')
    })

    it('stops after three failed tries and creates nothing', async () => {
      const { auth, database, countUsers } = world()
      const { prompts } = scripted({
        visible: good.visible,
        hidden: ['short', testPassword, 'different password', 'x', testPassword, 'other password!'],
      })

      await expect(createAdminUser({ auth, countUsers, prompts })).rejects.toThrow(
        'Too many wrong answers',
      )
      expect(database.user).toHaveLength(0)
    })
  })

  describe('when the user cannot be made', () => {
    it('says so plainly if the email is taken, and keeps the cause', async () => {
      const w = world()
      await createTestUser(w.auth, { email: 'ada@example.com' })
      const { prompts } = scripted({ ...good, confirms: [true] })

      const attempt = createAdminUser({ auth: w.auth, countUsers: w.countUsers, prompts })

      await expect(attempt).rejects.toThrow(
        'A user with that email already exists. Nothing was created.',
      )
      await expect(attempt).rejects.toHaveProperty('cause')
      expect(w.database.user).toHaveLength(1)
    })

    it('passes any other failure on unchanged', async () => {
      const { auth, countUsers } = world()
      vi.spyOn(auth.api, 'createUser').mockRejectedValue(new Error('database is down'))
      const { prompts } = scripted(good)

      await expect(createAdminUser({ auth, countUsers, prompts })).rejects.toThrow(
        'database is down',
      )
    })
  })
})
