import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import {
  readBoolean,
  readCents,
  readDecimalString,
  readIsoDate,
  readMonth,
  readNullableCents,
  readOptionalString,
  readString,
  readTiming,
  readWeights,
} from './validation'

describe('readString', () => {
  it('returns the field when it is a string', () => {
    expect(readString({ name: 'Fondo mundial' }, 'name')).toBe('Fondo mundial')
  })

  it('throws when the field is missing', () => {
    expect(() => readString({}, 'name')).toThrow(ValidationError)
    expect(() => readString({}, 'name')).toThrow('Field "name" is required')
  })

  it('throws when the field is not a string', () => {
    expect(() => readString({ name: 42 }, 'name')).toThrow('Field "name" must be a string, received 42')
  })
})

describe('readOptionalString', () => {
  it('returns the field when it is a string', () => {
    expect(readOptionalString({ note: 'ajuste' }, 'note')).toBe('ajuste')
  })

  it('returns undefined when the field is missing', () => {
    expect(readOptionalString({}, 'note')).toBeUndefined()
  })

  it('returns undefined when the field is explicitly null', () => {
    expect(readOptionalString({ note: null }, 'note')).toBeUndefined()
  })

  it('throws when the field is present but not a string', () => {
    expect(() => readOptionalString({ note: 42 }, 'note')).toThrow('Field "note" must be a string, received 42')
  })
})

describe('readCents', () => {
  it('returns the field when it is an integer', () => {
    expect(readCents({ amount: 20000 }, 'amount')).toBe(20000)
  })

  it('accepts zero and negative integers', () => {
    expect(readCents({ amount: 0 }, 'amount')).toBe(0)
    expect(readCents({ amount: -500 }, 'amount')).toBe(-500)
  })

  it('throws when the field is missing', () => {
    expect(() => readCents({}, 'amount')).toThrow('Field "amount" is required')
  })

  it('throws when the field is not an integer', () => {
    expect(() => readCents({ amount: 160.5 }, 'amount'))
      .toThrow('Field "amount" must be an integer number of cents, received 160.5')
  })

  it('throws when the field is a decimal string rather than a number', () => {
    expect(() => readCents({ amount: '200' }, 'amount'))
      .toThrow('Field "amount" must be an integer number of cents, received "200"')
  })

  it('throws when the field is NaN or Infinity', () => {
    expect(() => readCents({ amount: Number.NaN }, 'amount')).toThrow(ValidationError)
    expect(() => readCents({ amount: Number.POSITIVE_INFINITY }, 'amount')).toThrow(ValidationError)
  })
})

describe('readNullableCents', () => {
  it('returns the integer when the field is a number', () => {
    expect(readNullableCents({ amount: 500 }, 'amount')).toBe(500)
  })

  it('returns null when the field is explicitly null', () => {
    expect(readNullableCents({ amount: null }, 'amount')).toBeNull()
  })

  it('throws when the field is missing entirely', () => {
    expect(() => readNullableCents({}, 'amount')).toThrow('Field "amount" is required')
  })

  it('throws when the field is not an integer and not null', () => {
    expect(() => readNullableCents({ amount: 160.5 }, 'amount'))
      .toThrow('Field "amount" must be an integer number of cents, received 160.5')
  })
})

describe('readMonth', () => {
  it('returns the field when it matches YYYY-MM', () => {
    expect(readMonth({ fromMonth: '2026-08' }, 'fromMonth')).toBe('2026-08')
  })

  it('throws when the field is missing', () => {
    expect(() => readMonth({}, 'fromMonth')).toThrow('Field "fromMonth" is required')
  })

  it('throws with the exact message for a malformed month', () => {
    expect(() => readMonth({ fromMonth: '2026-8' }, 'fromMonth'))
      .toThrow('Field "fromMonth" must be a month in the format YYYY-MM, received "2026-8"')
  })

  it('rejects month 00 and month 13', () => {
    expect(() => readMonth({ fromMonth: '2026-00' }, 'fromMonth')).toThrow(ValidationError)
    expect(() => readMonth({ fromMonth: '2026-13' }, 'fromMonth')).toThrow(ValidationError)
  })

  it('rejects a value that is not a string', () => {
    expect(() => readMonth({ fromMonth: 202608 }, 'fromMonth'))
      .toThrow('Field "fromMonth" must be a month in the format YYYY-MM, received 202608')
  })
})

describe('readIsoDate', () => {
  it('returns the field when it matches YYYY-MM-DD', () => {
    expect(readIsoDate({ date: '2026-08-03' }, 'date')).toBe('2026-08-03')
  })

  it('throws when the field is missing', () => {
    expect(() => readIsoDate({}, 'date')).toThrow('Field "date" is required')
  })

  it('throws with the exact message for a malformed date', () => {
    expect(() => readIsoDate({ date: '03/08/2026' }, 'date'))
      .toThrow('Field "date" must be a date in the format YYYY-MM-DD, received "03/08/2026"')
  })

  it('rejects a calendar-invalid date such as 30 February', () => {
    expect(() => readIsoDate({ date: '2026-02-30' }, 'date')).toThrow(ValidationError)
  })
})

describe('readDecimalString', () => {
  it('returns the field when it is a decimal string', () => {
    expect(readDecimalString({ nav: '14.8321' }, 'nav')).toBe('14.8321')
  })

  it('accepts an integer-looking decimal string and a negative one', () => {
    expect(readDecimalString({ nav: '10' }, 'nav')).toBe('10')
    expect(readDecimalString({ nav: '-3.5' }, 'nav')).toBe('-3.5')
  })

  it('throws when the field is missing', () => {
    expect(() => readDecimalString({}, 'nav')).toThrow('Field "nav" is required')
  })

  it('rejects a JSON number instead of coercing it', () => {
    expect(() => readDecimalString({ nav: 14.8321 }, 'nav'))
      .toThrow('Field "nav" must be a decimal string, received 14.8321')
  })

  it('rejects a string that is not a plain decimal, such as scientific notation', () => {
    expect(() => readDecimalString({ nav: '1e3' }, 'nav'))
      .toThrow('Field "nav" must be a decimal string, received "1e3"')
  })

  it('rejects an empty string', () => {
    expect(() => readDecimalString({ nav: '' }, 'nav'))
      .toThrow('Field "nav" must be a decimal string, received ""')
  })
})

describe('readTiming', () => {
  it('returns "start" or "end"', () => {
    expect(readTiming({ timing: 'start' }, 'timing')).toBe('start')
    expect(readTiming({ timing: 'end' }, 'timing')).toBe('end')
  })

  it('throws when the field is missing', () => {
    expect(() => readTiming({}, 'timing')).toThrow('Field "timing" is required')
  })

  it('throws with the exact message for an invalid value', () => {
    expect(() => readTiming({ timing: 'middle' }, 'timing'))
      .toThrow('Field "timing" must be "start" or "end", received "middle"')
  })
})

describe('readWeights', () => {
  it('returns the weights when they add up to 1', () => {
    expect(readWeights({ weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }] }, 'weights'))
      .toEqual([{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }])
  })

  it('throws when the field is missing', () => {
    expect(() => readWeights({}, 'weights')).toThrow('Field "weights" is required')
  })

  it('throws with the exact message when the weights do not add up to 1', () => {
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: 0.7 }, { fundId: 'emerging', weight: 0.2 }] }, 'weights'))
      .toThrow('Field "weights" must add up to 1, they add up to 0.9')
  })

  it('throws when the field is an empty array', () => {
    expect(() => readWeights({ weights: [] }, 'weights')).toThrow(ValidationError)
  })

  it('throws when an item is missing fundId', () => {
    expect(() => readWeights({ weights: [{ weight: 1 }] }, 'weights')).toThrow(ValidationError)
  })

  it('throws when an item has a non-numeric weight', () => {
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: '1' }] }, 'weights')).toThrow(ValidationError)
  })
})

describe('readBoolean', () => {
  it('returns the field when it is a boolean', () => {
    expect(readBoolean({ active: true }, 'active')).toBe(true)
    expect(readBoolean({ active: false }, 'active')).toBe(false)
  })

  it('throws when the field is missing', () => {
    expect(() => readBoolean({}, 'active')).toThrow('Field "active" is required')
  })

  it('throws when the field is not a boolean', () => {
    expect(() => readBoolean({ active: 'true' }, 'active'))
      .toThrow('Field "active" must be a boolean, received "true"')
  })
})
