import { describe, expect, it } from 'vitest'
import {
  assertCents,
  parseWeights,
  serialiseWeights,
  toContributionOverride,
  toContributionRule,
  toNavPoint,
  toPurchase,
} from './mappers'
import type {
  ContributionOverrideRow,
  ContributionRuleRow,
  NavRow,
  PurchaseRow,
} from './schema'

describe('parseWeights', () => {
  it('parses a JSON array of weights', () => {
    expect(parseWeights('[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]'))
      .toEqual([{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }])
  })

  it('round-trips through serialiseWeights unchanged', () => {
    const weights = [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }]
    expect(parseWeights(serialiseWeights(weights))).toEqual(weights)
  })

  it('rejects an empty array because the weights add up to 0', () => {
    expect(() => parseWeights('[]'))
      .toThrow('Stored weights must add up to 1, they add up to 0')
  })

  it('rejects weights that do not add up to 1', () => {
    // Deliberately not asserting the exact tail: 0.8 + 0.1 in IEEE 754 is
    // 0.9000000000000001, and pinning that string would make the test brittle.
    expect(() => parseWeights('[{"fundId":"a","weight":0.8},{"fundId":"b","weight":0.1}]'))
      .toThrow('must add up to 1')
  })

  it('rejects a string that is not valid JSON', () => {
    expect(() => parseWeights('not json')).toThrow('Stored weights are not valid JSON')
  })

  it('rejects JSON that does not parse to an array', () => {
    expect(() => parseWeights('{"fundId":"a"}')).toThrow('Stored weights must be an array')
  })
})

describe('toContributionRule', () => {
  it('maps a row onto the core ContributionRule, dropping id and portfolioId', () => {
    const row: ContributionRuleRow = {
      id: 1,
      portfolioId: 'index',
      fromMonth: '2026-08',
      amount: 20_000,
      timing: 'start',
      weights: '[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]',
    }

    expect(toContributionRule(row)).toEqual({
      fromMonth: '2026-08',
      amount: 20_000,
      timing: 'start',
      weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
    })
  })

  it('rejects a timing outside the enum, since the schema has no CHECK constraint', () => {
    const row = {
      id: 1,
      portfolioId: 'index',
      fromMonth: '2026-08',
      amount: 20_000,
      timing: 'quarterly',
      weights: '[{"fundId":"world","weight":1}]',
    } as unknown as ContributionRuleRow

    expect(() => toContributionRule(row)).toThrow('quarterly')
  })

  it('rejects a non-integer amount through assertCents', () => {
    const row = {
      id: 1,
      portfolioId: 'index',
      fromMonth: '2026-08',
      amount: 200.5,
      timing: 'start',
      weights: '[{"fundId":"world","weight":1}]',
    } as unknown as ContributionRuleRow

    expect(() => toContributionRule(row)).toThrow('must be an integer number of cents')
  })
})

describe('toContributionOverride', () => {
  it('maps a skipped month, omitting timing and note when the columns are null', () => {
    const row: ContributionOverrideRow = {
      id: 1,
      portfolioId: 'index',
      month: '2026-10',
      amount: null,
      timing: null,
      note: null,
    }

    expect(toContributionOverride(row)).toEqual({ month: '2026-10', amount: null })
  })

  it('includes timing and note when the columns carry a value', () => {
    const row: ContributionOverrideRow = {
      id: 2,
      portfolioId: 'index',
      month: '2026-11',
      amount: 30_000,
      timing: 'end',
      note: 'Christmas bonus',
    }

    expect(toContributionOverride(row)).toEqual({
      month: '2026-11',
      amount: 30_000,
      timing: 'end',
      note: 'Christmas bonus',
    })
  })
})

describe('toPurchase', () => {
  const row: PurchaseRow = {
    id: 7,
    portfolioId: 'index',
    fundId: 'world',
    month: '2026-08',
    date: '2026-08-03',
    amount: 16_000,
    nav: '14.8321',
    units: '10.787414',
    source: 'auto',
  }

  it('maps a row onto a StoredPurchase, keeping the five money fields byte-identical', () => {
    expect(toPurchase(row)).toEqual({
      id: 7,
      portfolioId: 'index',
      month: '2026-08',
      source: 'auto',
      fundId: 'world',
      date: '2026-08-03',
      amount: 16_000,
      nav: '14.8321',
      units: '10.787414',
    })
  })

  it('rejects a source outside the enum, since the schema has no CHECK constraint', () => {
    const bad = { ...row, source: 'batch' } as unknown as PurchaseRow
    expect(() => toPurchase(bad)).toThrow('batch')
  })

  it('rejects a non-integer amount through assertCents', () => {
    const bad = { ...row, amount: 160.5 } as unknown as PurchaseRow
    expect(() => toPurchase(bad)).toThrow('must be an integer number of cents')
  })
})

describe('toNavPoint', () => {
  it('maps a row onto the core NavPoint, without converting the value to a number', () => {
    const row: NavRow = { id: 1, fundId: 'world', date: '2026-08-03', value: '14.8321', source: 'yahoo' }
    expect(toNavPoint(row)).toEqual({ date: '2026-08-03', value: '14.8321' })
  })

  it('rejects a source outside the enum, since the schema has no CHECK constraint', () => {
    const row = {
      id: 1,
      fundId: 'world',
      date: '2026-08-03',
      value: '14.8321',
      source: 'corrupted',
    } as unknown as NavRow

    expect(() => toNavPoint(row))
      .toThrow('Column "source" must be "yahoo" or "manual", found "corrupted"')
  })
})

describe('assertCents', () => {
  it('accepts an integer and returns it unchanged', () => {
    expect(assertCents(16_000, 'amount')).toBe(16_000)
  })

  it('rejects a fractional number, naming the field and the value', () => {
    expect(() => assertCents(160.5, 'amount'))
      .toThrow('Column "amount" must be an integer number of cents, found 160.5')
  })

  it('rejects null with the same message shape', () => {
    expect(() => assertCents(null, 'amount'))
      .toThrow('Column "amount" must be an integer number of cents, found null')
  })

  it('rejects NaN', () => {
    expect(() => assertCents(Number.NaN, 'amount'))
      .toThrow('Column "amount" must be an integer number of cents, found NaN')
  })

  it('rejects Infinity', () => {
    expect(() => assertCents(Number.POSITIVE_INFINITY, 'amount'))
      .toThrow('Column "amount" must be an integer number of cents, found Infinity')
  })

  it('rejects a non-numeric value', () => {
    expect(() => assertCents('16000', 'amount'))
      .toThrow('Column "amount" must be an integer number of cents, found 16000')
  })
})
