import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'

describe('andamiaje', () => {
  it('vitest ejecuta los tests de core', () => {
    expect(true).toBe(true)
  })

  it('decimal.js está disponible y no usa coma flotante', () => {
    expect(new Decimal(0.1).plus(0.2).toString()).toBe('0.3')
    expect(0.1 + 0.2).not.toBe(0.3)
  })
})
