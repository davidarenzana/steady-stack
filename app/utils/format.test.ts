import { describe, expect, it } from 'vitest'
import {
  formatEuros,
  formatInteger,
  formatIsoDate,
  formatMonth,
  formatNav,
  formatPercent,
  formatRate,
  formatSignedEuros,
  formatSignedPercent,
  formatUnits,
  formatWeight,
  formatXirr,
} from './format'

/**
 * Every expected value here is Spanish typography as the spec defines it:
 * comma for the decimal separator, point for thousands, the unit after the
 * figure with a space. Every space in this file is an ordinary U+0020, which
 * is what `normaliseSpaces` in the module exists to guarantee — `Intl` itself
 * emits U+00A0.
 */

describe('formatEuros', () => {
  it('formats an amount in cents as euros', () => {
    expect(formatEuros(243150)).toBe('2.431,50 €')
    expect(formatEuros(0)).toBe('0,00 €')
    expect(formatEuros(5)).toBe('0,05 €')
    expect(formatEuros(100000000)).toBe('1.000.000,00 €')
  })

  it('groups thousands even at four digits', () => {
    // The case that fails the moment somebody simplifies `useGrouping:
    // 'always'` away: the es-ES default renders exactly four digits without a
    // separator, as '1090,00 €'. This is also the figure the spec's
    // compounding example uses.
    expect(formatEuros(109000)).toBe('1.090,00 €')
  })

  it('does not group below a thousand', () => {
    // The last value before grouping applies.
    expect(formatEuros(99900)).toBe('999,00 €')
  })

  it('formats a loss as the mirror of a gain', () => {
    expect(formatEuros(-23150)).toBe('-231,50 €')
    expect(formatSignedEuros(-23150)).toBe('-231,50 €')
    expect(formatSignedEuros(23150)).toBe('+231,50 €')
  })

  it('separates the figure from its unit with an ordinary space', () => {
    // `Intl` emits U+00A0 here. This is the test that keeps
    // `normaliseSpaces` from being deleted as pointless: without it the
    // assertions above fail on a character nobody can see.
    expect(formatEuros(109000)).not.toContain('\u00A0')
    expect(formatPercent(0.09)).not.toContain('\u00A0')
    expect(formatUnits('1234.567890')).not.toContain('\u202F')
    expect(formatEuros(109000)).toContain(' €')
  })
})

describe('formatSignedEuros', () => {
  it('signs a non-zero amount and leaves zero unsigned', () => {
    expect(formatSignedEuros(23150)).toBe('+231,50 €')
    expect(formatSignedEuros(-23150)).toBe('-231,50 €')
    expect(formatSignedEuros(0)).toBe('0,00 €')
  })
})

describe('formatPercent', () => {
  it('formats a ratio with two decimals', () => {
    expect(formatPercent(0.1052272727272727)).toBe('10,52 %')
    expect(formatPercent(0)).toBe('0,00 %')
    expect(formatPercent(-0.0525)).toBe('-5,25 %')
  })
})

describe('formatSignedPercent', () => {
  it('signs a non-zero ratio', () => {
    expect(formatSignedPercent(0.1052272727272727)).toBe('+10,52 %')
  })
})

describe('formatRate', () => {
  it('formats an annual rate held as a decimal string, without trailing zeros', () => {
    // The rate never becomes a number on the way in: '0.09' is 9 %, and the
    // string is handed to `Intl` as it arrived.
    expect(formatRate('0.09')).toBe('9 %')
    expect(formatRate('0')).toBe('0 %')
    expect(formatRate('0.0725')).toBe('7,25 %')
  })
})

describe('formatWeight', () => {
  it('renders a split weight as a percentage without trailing zeros', () => {
    // What the contributions screen shows in place of a euro split, because
    // the API sends weights and dividing money is `split()`'s job.
    expect(formatWeight(0.8)).toBe('80 %')
    expect(formatWeight(0.2)).toBe('20 %')
    expect(formatWeight(0.125)).toBe('12,5 %')
  })
})

describe('formatUnits', () => {
  it('formats units with four decimals', () => {
    expect(formatUnits('107.864100')).toBe('107,8641')
    expect(formatUnits('0.000000')).toBe('0,0000')
    expect(formatUnits('1234.567890')).toBe('1.234,5679')
  })
})

describe('formatNav', () => {
  it('formats a net asset value with four decimals and the currency', () => {
    expect(formatNav('14.8321')).toBe('14,8321 €')
    expect(formatNav('10')).toBe('10,0000 €')
  })
})

describe('formatIsoDate', () => {
  it('turns an ISO date into a Spanish one', () => {
    expect(formatIsoDate('2026-08-06')).toBe('06/08/2026')
  })
})

describe('formatMonth', () => {
  it('turns a month into an abbreviated Spanish month and year', () => {
    expect(formatMonth('2026-08')).toBe('ago 2026')
    expect(formatMonth('2026-01')).toBe('ene 2026')
  })
})

describe('formatXirr', () => {
  it('shows an em dash when there is not enough data to compute one', () => {
    expect(formatXirr(null)).toBe('—')
  })

  it('signs a computed rate', () => {
    expect(formatXirr(0.0847)).toBe('+8,47 %')
  })
})

describe('formatInteger', () => {
  it('groups a whole number', () => {
    expect(formatInteger(14415)).toBe('14.415')
  })
})

describe('the figures of section 11 of the spec', () => {
  it('renders the gain of section 11 of the spec', () => {
    // The subtraction lives here and not in the module: a component receives
    // `gain` and `gainRatio` from the API already computed.
    const invested = 220000
    const value = 243150

    expect(formatSignedEuros(value - invested)).toBe('+231,50 €')
    expect(formatSignedPercent((value - invested) / invested)).toBe('+10,52 %')
  })
})
