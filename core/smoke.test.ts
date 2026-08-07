import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'

describe('scaffolding', () => {
  it('vitest runs the core tests', () => {
    expect(true).toBe(true)
  })

  it('decimal.js is available and does not use floating point', () => {
    expect(new Decimal(0.1).plus(0.2).toString()).toBe('0.3')
    expect(0.1 + 0.2).not.toBe(0.3)
  })
})
