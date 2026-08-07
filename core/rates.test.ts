import { describe, expect, it } from 'vitest'
import { monthlyRate } from './rates'
import Decimal from './decimal'

describe('monthlyRate', () => {
  it('a 9 % annual rate compounded twelve times returns exactly 9 %', () => {
    const rate = monthlyRate(0.09)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(afterTwelveMonths.toFixed(2)).toBe('1090.00')
  })

  it('a 5 % annual rate compounded twelve times returns exactly 5 %', () => {
    const rate = monthlyRate(0.05)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(afterTwelveMonths.toFixed(2)).toBe('1050.00')
  })

  it('is not the division r/12', () => {
    // The r/12 shortcut would give 0,0075 and produce 1.093,81 € instead of 1.090,00 €.
    const rate = monthlyRate(0.09)

    expect(rate.toFixed(6)).toBe('0.007207')
    expect(rate.toNumber()).not.toBeCloseTo(0.09 / 12, 6)
  })

  it('a 0 % rate generates no return', () => {
    const rate = monthlyRate(0)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(rate.toNumber()).toBe(0)
    expect(afterTwelveMonths.toFixed(2)).toBe('1000.00')
  })

  it('accepts negative rates', () => {
    const rate = monthlyRate(-0.1)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(rate.toNumber()).toBeLessThan(0)
    expect(afterTwelveMonths.toFixed(2)).toBe('900.00')
  })

  it('rejects a rate that would destroy more than the capital', () => {
    expect(() => monthlyRate(-1.5)).toThrow('Annual rate cannot be below -100 %')
  })

  it('accepts the exact -100 % boundary and wipes out the capital', () => {
    const rate = monthlyRate(-1)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(() => monthlyRate(-1)).not.toThrow()
    expect(rate.toNumber()).toBe(-1)
    expect(afterTwelveMonths.toFixed(2)).toBe('0.00')
  })
})
