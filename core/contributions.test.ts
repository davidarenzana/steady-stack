import { describe, expect, it } from 'vitest'
import { expandContributions } from './contributions'
import type { ContributionOverride, ContributionRule } from './types'

const WEIGHTS = [
  { fundId: 'world', weight: 0.8 },
  { fundId: 'emerging', weight: 0.2 },
]

/** The portfolio's real rule: 200 €/month from August 2026. */
const MONTHLY: ContributionRule = {
  fromMonth: '2026-08',
  amount: 20_000,
  timing: 'start',
  weights: WEIGHTS,
}

describe('expandContributions', () => {
  it('produces one entry per month in the range', () => {
    const result = expandContributions([MONTHLY], [], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(result.every((c) => c.amount === 20_000)).toBe(true)
    expect(result.every((c) => c.timing === 'start')).toBe(true)
  })

  it('ignores the months before the rule takes effect', () => {
    const result = expandContributions([MONTHLY], [], '2026-05', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it('applies the most recent rule already in force', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }
    const result = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-11', 20_000],
      ['2026-12', 20_000],
      ['2027-01', 40_000],
      ['2027-02', 40_000],
    ])
  })

  it('raising the contribution does not rewrite the past', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const before = expandContributions([MONTHLY], [], '2026-08', '2026-12')
    const after = expandContributions([MONTHLY, raise], [], '2026-08', '2026-12')

    expect(after).toEqual(before)
  })

  it('does not depend on the order the rules arrive in', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const ordered = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')
    const shuffled = expandContributions([raise, MONTHLY], [], '2026-11', '2027-02')

    expect(shuffled).toEqual(ordered)
  })

  it('an exception with an amount supersedes the rule amount', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000, note: 'bonus' }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-08', 20_000],
      ['2026-09', 20_000],
      ['2026-10', 150_000],
      ['2026-11', 20_000],
    ])
  })

  it('an exception with a null amount skips the month', () => {
    const skip: ContributionOverride = { month: '2026-10', amount: null, note: 'no cash that month' }
    const result = expandContributions([MONTHLY], [skip], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-11'])
  })

  it('an exception can change when in the month the contribution lands', () => {
    const late: ContributionOverride = { month: '2026-10', amount: 20_000, timing: 'end' }
    const result = expandContributions([MONTHLY], [late], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.timing).toBe('end')
    expect(result.find((c) => c.month === '2026-09')?.timing).toBe('start')
  })

  it('an exception inherits the weights of the rule in force', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000 }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.weights).toEqual(WEIGHTS)
  })

  it('ignores an exception for a month with no rule in force', () => {
    const orphan: ContributionOverride = { month: '2026-05', amount: 50_000 }
    const result = expandContributions([MONTHLY], [orphan], '2026-01', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it("reproduces the portfolio's real start", () => {
    // 2.000 € up front in July, plus the 200 €/month rule from August.
    const initial: ContributionRule = {
      fromMonth: '2026-07',
      amount: 200_000,
      timing: 'start',
      weights: WEIGHTS,
    }
    // From August, MONTHLY is the most recent rule and supersedes the initial one
    // with no need for any exception.
    const result = expandContributions([initial, MONTHLY], [], '2026-07', '2026-09')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-07', 200_000],
      ['2026-08', 20_000],
      ['2026-09', 20_000],
    ])
  })

  it('returns an empty list when there are no rules', () => {
    expect(expandContributions([], [], '2026-08', '2026-11')).toEqual([])
  })

  it('rejects two rules with the same start month', () => {
    const duplicate: ContributionRule = { ...MONTHLY, amount: 10_000 }

    expect(() => expandContributions([MONTHLY, duplicate], [], '2026-08', '2026-11')).toThrow(
      'Two contribution rules share the same start month: "2026-08"',
    )
  })

  it('rejects the duplicate in either array order', () => {
    const duplicate: ContributionRule = { ...MONTHLY, amount: 10_000 }

    expect(() => expandContributions([MONTHLY, duplicate], [], '2026-08', '2026-11')).toThrow(
      'Two contribution rules share the same start month: "2026-08"',
    )
    expect(() => expandContributions([duplicate, MONTHLY], [], '2026-08', '2026-11')).toThrow(
      'Two contribution rules share the same start month: "2026-08"',
    )
  })

  it('does not throw when the start months differ', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    expect(() => expandContributions([MONTHLY, raise], [], '2026-08', '2027-02')).not.toThrow()
  })

  it('an exception with an amount of zero appears in the series, it is not skipped', () => {
    const zero: ContributionOverride = { month: '2026-10', amount: 0, note: 'zero amount' }
    const result = expandContributions([MONTHLY], [zero], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(result.find((c) => c.month === '2026-10')?.amount).toBe(0)
  })

  it('a rule, a skipped month and a bonus produce the right series (spec section 11)', () => {
    const skip: ContributionOverride = { month: '2026-09', amount: null, note: 'no cash that month' }
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000, note: 'bonus' }
    const result = expandContributions([MONTHLY], [skip, extra], '2026-08', '2026-11')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-08', 20_000],
      ['2026-10', 150_000],
      ['2026-11', 20_000],
    ])
  })
})
