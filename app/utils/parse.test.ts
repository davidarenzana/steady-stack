import { describe, expect, it } from 'vitest'
import { formatCentsForInput, parseEurosToCents, parseWeights } from './parse'

describe('parseEurosToCents', () => {
  it('reads an amount typed with either separator', () => {
    // A Spanish keyboard produces the comma; a numeric input produces the
    // point. Both are the same amount and both have to work.
    expect(parseEurosToCents('200')).toBe(20000)
    expect(parseEurosToCents('200.5')).toBe(20050)
    expect(parseEurosToCents('200,50')).toBe(20050)
    expect(parseEurosToCents('0')).toBe(0)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseEurosToCents('  200  ')).toBe(20000)
  })

  it('refuses what is not an amount', () => {
    expect(parseEurosToCents('')).toBeNull()
    expect(parseEurosToCents('abc')).toBeNull()
    expect(parseEurosToCents('200 €')).toBeNull()
  })

  it('refuses more precision than a cent', () => {
    // A cent is the smallest unit there is, so a third decimal place is a typo
    // rather than a value to round quietly: rounding it would silently change
    // what the user typed.
    expect(parseEurosToCents('200.555')).toBeNull()
  })

  it('refuses a negative amount', () => {
    // A contribution of minus 200 € is not a contribution.
    expect(parseEurosToCents('-200')).toBeNull()
  })

  it('never lands on a floating-point error', () => {
    // The reason this goes through Decimal rather than `Number(text) * 100`:
    // 0.07 * 100 is 7.000000000000001 in binary floating point, and 8.11 * 100
    // is 810.9999999999999, which would truncate to 810 cents.
    expect(parseEurosToCents('0.07')).toBe(7)
    expect(parseEurosToCents('8.11')).toBe(811)
    expect(parseEurosToCents('1234.56')).toBe(123456)
  })
})

describe('formatCentsForInput', () => {
  it('renders cents for an input element, with a point and two decimals', () => {
    // Not Spanish typography: this fills the `value` of an
    // `<input type="number">`, which only accepts a point.
    expect(formatCentsForInput(20000)).toBe('200.00')
    expect(formatCentsForInput(5)).toBe('0.05')
    expect(formatCentsForInput(0)).toBe('0.00')
  })

  it('round-trips through parseEurosToCents', () => {
    for (const cents of [0, 5, 20000, 123456]) {
      expect(parseEurosToCents(formatCentsForInput(cents))).toBe(cents)
    }
  })
})

describe('parseWeights', () => {
  it('parses the weights column, which the API returns as a JSON string', () => {
    // `rules[].weights` is a TEXT column holding JSON.stringify(Weight[]) and
    // the route returns the row untouched, so the interface has to parse it.
    // `months[].weights`, by contrast, arrives as a real array.
    expect(parseWeights('[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]'))
      .toEqual([{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }])
  })

  it('throws on anything that is not a non-empty array of weights', () => {
    expect(() => parseWeights('nope')).toThrow()
    expect(() => parseWeights('[]')).toThrow()
    expect(() => parseWeights('{}')).toThrow()
    expect(() => parseWeights('[{"fundId":"world"}]')).toThrow()
    expect(() => parseWeights('[{"weight":0.8}]')).toThrow()
    expect(() => parseWeights('[{"fundId":"world","weight":"0.8"}]')).toThrow()
  })
})
