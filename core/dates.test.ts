import { describe, expect, it } from 'vitest'
import { addDays, firstDayOfMonth, lastDayOfMonth, monthOf } from './dates'

describe('firstDayOfMonth', () => {
  it('returns the first day of the month', () => {
    expect(firstDayOfMonth('2026-08')).toBe('2026-08-01')
  })

  it('rejects an invalid month', () => {
    expect(() => firstDayOfMonth('2026-8')).toThrow('Invalid month')
  })
})

describe('lastDayOfMonth', () => {
  it('handles a 31-day month', () => {
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31')
  })

  it('handles a 30-day month', () => {
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30')
  })

  it('handles February in a common year', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
  })

  it('handles February in a leap year', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
  })

  it('handles December', () => {
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31')
  })
})

describe('monthOf', () => {
  it('takes the month of a date', () => {
    expect(monthOf('2026-08-03')).toBe('2026-08')
  })

  it('rejects a malformed date', () => {
    expect(() => monthOf('2026-8-3')).toThrow('Invalid date: "2026-8-3"')
  })

  it('rejects a date that does not exist in the calendar', () => {
    expect(() => monthOf('2026-02-30')).toThrow('Invalid date: "2026-02-30"')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('crosses a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('returns the same date when the offset is zero', () => {
    expect(addDays('2026-08-03', 0)).toBe('2026-08-03')
  })

  it('rejects a fractional offset', () => {
    expect(() => addDays('2026-08-03', 1.5)).toThrow('Day offset must be an integer, received 1.5')
  })
})
