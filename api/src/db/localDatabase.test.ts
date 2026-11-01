import { describe, expect, it } from 'vitest'
import { describeDatabase, isLocalDatabase } from './localDatabase.ts'

describe('isLocalDatabase', () => {
  it.each([
    'mariadb://megabucks:bowling4money@localhost:15306/bowling_megabucks',
    'mysql://root@127.0.0.1:3306/db',
    'mariadb://u:p@[::1]:3306/db',
    'mariadb://u:p@localhost/db',
  ])('says yes for %s', (url) => {
    expect(isLocalDatabase(url)).toBe(true)
  })

  it.each([
    'mariadb://u:p@db.example.com:3306/db',
    'mariadb://u:p@10.0.0.5:3306/db',
    'mariadb://u:p@localhost.example.com:3306/db',
    'mariadb://u:p@notlocalhost:3306/db',
    'mariadb://u:p@127.0.0.1.example.com/db',
    'mariadb://localhost@db.example.com:3306/db',
    'not a url',
    '',
  ])('says no for %s', (url) => {
    expect(isLocalDatabase(url)).toBe(false)
  })
})

describe('describeDatabase', () => {
  it('names the host, port, and database, and leaves out the user and password', () => {
    const text = describeDatabase(
      'mariadb://megabucks:bowling4money@db.example.com:3306/tournaments',
    )

    expect(text).toBe('db.example.com:3306/tournaments')
    expect(text).not.toContain('bowling4money')
    expect(text).not.toContain('megabucks')
  })

  it('leaves out the port when the URL has none', () => {
    expect(describeDatabase('mariadb://u:p@db.example.com/tournaments')).toBe(
      'db.example.com/tournaments',
    )
  })
})
