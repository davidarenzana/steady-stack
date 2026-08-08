import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDatabaseFile } from './database'

describe('resolveDatabaseFile', () => {
  it('returns an absolute STEADY_STACK_DATABASE_FILE unchanged', () => {
    const env = { STEADY_STACK_DATABASE_FILE: '/var/data/custom.db' }
    expect(resolveDatabaseFile(env)).toBe('/var/data/custom.db')
  })

  it('resolves a relative STEADY_STACK_DATABASE_FILE against the working directory', () => {
    const env = { STEADY_STACK_DATABASE_FILE: 'tmp/custom.db' }
    expect(resolveDatabaseFile(env)).toBe(resolve(process.cwd(), 'tmp/custom.db'))
  })

  it('falls back to data/steady-stack.db when the variable is unset', () => {
    expect(resolveDatabaseFile({})).toBe(resolve(process.cwd(), 'data/steady-stack.db'))
  })

  it('treats an empty string as unset', () => {
    const env = { STEADY_STACK_DATABASE_FILE: '' }
    expect(resolveDatabaseFile(env)).toBe(resolve(process.cwd(), 'data/steady-stack.db'))
  })
})
