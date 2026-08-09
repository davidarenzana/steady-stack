import { describe, expect, it } from 'vitest'
import { formatRateForInput, parsePercentToRate } from './rate'

describe('parsePercentToRate', () => {
  it('turns a typed percentage into the decimal string the API stores', () => {
    expect(parsePercentToRate('9')).toBe('0.09')
    expect(parsePercentToRate('0')).toBe('0')
    expect(parsePercentToRate('5')).toBe('0.05')
    expect(parsePercentToRate('7.25')).toBe('0.0725')
  })

  it('accepts the Spanish decimal separator', () => {
    expect(parsePercentToRate('7,25')).toBe('0.0725')
  })

  it('drops trailing zeros rather than storing 0.090000', () => {
    // `toFixed()` with no argument is what does this. The API takes any decimal
    // string, but a rate read back out of the database is rendered by
    // `formatRate`, and `'0.090000'` and `'0.09'` are the same number stored two
    // ways — one of which looks like six decimals of precision nobody claimed.
    expect(parsePercentToRate('9')).not.toContain('000')
  })

  it('refuses anything that is not a percentage', () => {
    expect(parsePercentToRate('')).toBeNull()
    expect(parsePercentToRate('   ')).toBeNull()
    expect(parsePercentToRate('-3')).toBeNull()
    expect(parsePercentToRate('abc')).toBeNull()
    expect(parsePercentToRate('9%')).toBeNull()
    // More than four decimal places of a percent is a hundredth of a basis
    // point: more precision than a 25-year projection deserves, and past the
    // point where a typo is more likely than an intention.
    expect(parsePercentToRate('7.25001')).toBeNull()
  })

  it('never goes through a float', () => {
    // `7.25 / 100` in binary floating point is not `0.0725`, and `9 / 100` is
    // `0.09` only by luck of how it prints. This is the assertion that would
    // fail if `Decimal` were ever swapped for arithmetic on a `number`.
    expect(parsePercentToRate('7.25')).toBe('0.0725')
    expect(parsePercentToRate('8.11')).toBe('0.0811')
    expect(parsePercentToRate('2.03')).toBe('0.0203')
  })
})

describe('formatRateForInput', () => {
  it('turns a stored rate back into the percentage a person types', () => {
    expect(formatRateForInput('0.09')).toBe('9')
    expect(formatRateForInput('0')).toBe('0')
    expect(formatRateForInput('0.0725')).toBe('7.25')
  })

  it('is not Spanish typography', () => {
    // Deliberately a point and no `%`: this fills an `<input type="number">`,
    // which discards a value with a comma in it. `formatRate` in
    // `app/utils/format.ts` is the one that renders `9 %` for reading.
    expect(formatRateForInput('0.0725')).not.toContain(',')
    expect(formatRateForInput('0.09')).not.toContain('%')
  })
})

describe('the round trip', () => {
  it('returns every rate to exactly the string it started from', () => {
    for (const rate of ['0', '0.05', '0.09', '0.0725']) {
      expect(parsePercentToRate(formatRateForInput(rate))).toBe(rate)
    }
  })
})
