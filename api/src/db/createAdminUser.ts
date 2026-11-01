import { APIError } from 'better-auth/api'
import { z } from 'zod'
import { maxPasswordLength, minPasswordLength, type Auth } from '../shared/auth/createAuth.ts'
import type { Prompts } from './terminalPrompts.ts'

export interface CreateAdminDependencies {
  auth: Auth
  /** How many users the database already has. */
  countUsers: () => Promise<number>
  prompts: Prompts
}

export interface CreatedAdmin {
  id: string
  email: string
}

const attempts = 3
const tooManyTries = 'Too many wrong answers. Nothing was created.'
const maxNameLength = 255

async function askEmail(prompts: Prompts): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const parsed = z.email().safeParse((await prompts.ask('Email:')).trim())
    if (parsed.success) return parsed.data.toLowerCase()
    prompts.print('That is not an email address.')
  }
  throw new Error(tooManyTries)
}

async function askName(prompts: Prompts): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const name = (await prompts.ask('Name:')).trim()
    if (name !== '' && name.length <= maxNameLength) return name
    prompts.print(`The name needs 1 to ${maxNameLength} characters.`)
  }
  throw new Error(tooManyTries)
}

async function askPassword(prompts: Prompts): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const password = await prompts.askHidden('Password:')
    if (password.length < minPasswordLength || password.length > maxPasswordLength) {
      prompts.print(`The password needs ${minPasswordLength} to ${maxPasswordLength} characters.`)
    } else if (password === (await prompts.askHidden('Password again:'))) {
      return password
    } else {
      prompts.print('The two passwords differ.')
    }
  }
  throw new Error(tooManyTries)
}

/**
 * Make an admin from the answers a person types (D-101). The first admin comes from here, because
 * the sign-in has no sign-up. Better Auth hashes the password, and its `createUser` does not check
 * the length, so we do (`minPasswordLength`). If users exist already, ask before adding another.
 * Prints the email and never the password. Throws an `Error` with a plain message on bad input.
 */
export async function createAdminUser({
  auth,
  countUsers,
  prompts,
}: CreateAdminDependencies): Promise<CreatedAdmin | null> {
  const existing = await countUsers()
  if (existing > 0) {
    prompts.print(`The database already has ${existing} user${existing === 1 ? '' : 's'}.`)
    if (!(await prompts.confirm('Create another admin?'))) {
      prompts.print('Nothing created.')
      return null
    }
  }

  const email = await askEmail(prompts)
  const name = await askName(prompts)
  const password = await askPassword(prompts)

  try {
    const { user } = await auth.api.createUser({ body: { email, name, password, role: 'admin' } })
    prompts.print(`Created admin ${user.email}. Sign in with the password you just typed.`)
    return { id: user.id, email: user.email }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
      throw new Error('A user with that email already exists. Nothing was created.', {
        cause: error,
      })
    }
    throw error
  }
}
