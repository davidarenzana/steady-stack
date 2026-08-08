import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import {
  hasField,
  readBoolean,
  readCents,
  readClearableString,
  readDecimalString,
  readIntegerRouteParam,
  readIsoDate,
  readIsoDateNotAfter,
  readMonth,
  readMonthRouteParam,
  readNonEmptyString,
  readNullableCents,
  readOptionalBoolean,
  readOptionalCents,
  readOptionalDecimalString,
  readOptionalIsoDate,
  readOptionalMonth,
  readOptionalPositiveInteger,
  readOptionalString,
  readOptionalStringArray,
  readOptionalTiming,
  readOptionalWeights,
  readPositiveDecimalString,
  readRouteParam,
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

describe('readClearableString', () => {
  it('returns the field when it is a string', () => {
    expect(readClearableString({ providerSymbol: '0P0001CLDK.F' }, 'providerSymbol')).toBe('0P0001CLDK.F')
  })

  it('returns undefined when the field is missing, meaning leave the stored value alone', () => {
    expect(readClearableString({}, 'providerSymbol')).toBeUndefined()
  })

  it('returns null when the field is explicitly null, meaning clear the column', () => {
    // The whole reason this function exists next to `readOptionalString`,
    // which collapses both of these into `undefined`.
    expect(readClearableString({ providerSymbol: null }, 'providerSymbol')).toBeNull()
  })

  it('throws when the field is present but neither a string nor null', () => {
    expect(() => readClearableString({ providerSymbol: 42 }, 'providerSymbol'))
      .toThrow('Field "providerSymbol" must be a string, received 42')
    expect(() => readClearableString({ providerSymbol: 42 }, 'providerSymbol')).toThrow(ValidationError)
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

  it('throws with the exact message for a negative weight, even when the split still sums to 1', () => {
    // -1 + 2 = 1: the sum check alone would let this through.
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: -1 }, { fundId: 'emerging', weight: 2 }] }, 'weights'))
      .toThrow('Field "weights[0].weight" must be a number greater than 0 and at most 1, received -1')
  })

  it('rejects a weight of exactly zero', () => {
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: 0 }, { fundId: 'emerging', weight: 1 }] }, 'weights'))
      .toThrow('Field "weights[0].weight" must be a number greater than 0 and at most 1, received 0')
  })

  it('rejects a weight above 1', () => {
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: 1.5 }, { fundId: 'emerging', weight: -0.5 }] }, 'weights'))
      .toThrow('Field "weights[0].weight" must be a number greater than 0 and at most 1, received 1.5')
  })

  it('accepts a single fund at weight 1', () => {
    expect(readWeights({ weights: [{ fundId: 'world', weight: 1 }] }, 'weights'))
      .toEqual([{ fundId: 'world', weight: 1 }])
  })

  it('rejects an empty fundId', () => {
    expect(() => readWeights({ weights: [{ fundId: '', weight: 1 }] }, 'weights')).toThrow(ValidationError)
  })

  it('throws with the exact message when the same fundId appears twice', () => {
    expect(() => readWeights({ weights: [{ fundId: 'world', weight: 0.5 }, { fundId: 'world', weight: 0.5 }] }, 'weights'))
      .toThrow('Field "weights" cannot repeat fundId "world"')
  })
})

describe('readNonEmptyString', () => {
  it('returns the field when it is a non-empty string', () => {
    expect(readNonEmptyString({ fundId: 'world' }, 'fundId')).toBe('world')
  })

  it('throws when the field is missing', () => {
    expect(() => readNonEmptyString({}, 'fundId')).toThrow('Field "fundId" is required')
  })

  it('throws with the exact message for an empty string', () => {
    expect(() => readNonEmptyString({ fundId: '' }, 'fundId'))
      .toThrow('Field "fundId" must not be an empty string')
  })

  it('throws when the field is not a string', () => {
    expect(() => readNonEmptyString({ fundId: 42 }, 'fundId'))
      .toThrow('Field "fundId" must be a string, received 42')
  })
})

describe('readOptionalPositiveInteger', () => {
  it('returns the field when it is a positive integer', () => {
    expect(readOptionalPositiveInteger({ horizonYears: 10 }, 'horizonYears')).toBe(10)
  })

  it('returns undefined when the field is missing or null', () => {
    expect(readOptionalPositiveInteger({}, 'horizonYears')).toBeUndefined()
    expect(readOptionalPositiveInteger({ horizonYears: null }, 'horizonYears')).toBeUndefined()
  })

  it('throws on zero, negative or fractional', () => {
    expect(() => readOptionalPositiveInteger({ horizonYears: 0 }, 'horizonYears')).toThrow(ValidationError)
    expect(() => readOptionalPositiveInteger({ horizonYears: -5 }, 'horizonYears')).toThrow(ValidationError)
    expect(() => readOptionalPositiveInteger({ horizonYears: 2.5 }, 'horizonYears')).toThrow(ValidationError)
  })
})

describe('readIsoDateNotAfter', () => {
  it('returns the date when it is on or before the bound', () => {
    expect(readIsoDateNotAfter({ date: '2026-08-07' }, 'date', '2026-08-07')).toBe('2026-08-07')
    expect(readIsoDateNotAfter({ date: '2026-08-01' }, 'date', '2026-08-07')).toBe('2026-08-01')
  })

  it('throws with the exact message for a date after the bound', () => {
    expect(() => readIsoDateNotAfter({ date: '2026-09-01' }, 'date', '2026-08-07'))
      .toThrow('Field "date" cannot be later than 2026-08-07, received "2026-09-01"')
  })
})

describe('readPositiveDecimalString', () => {
  it('returns the field when it is a positive decimal string', () => {
    expect(readPositiveDecimalString({ value: '14.8321' }, 'value')).toBe('14.8321')
  })

  it('throws with the exact message for zero', () => {
    expect(() => readPositiveDecimalString({ value: '0' }, 'value'))
      .toThrow('Field "value" must be a positive decimal, received "0"')
  })

  it('throws for a negative decimal', () => {
    expect(() => readPositiveDecimalString({ value: '-1.5' }, 'value')).toThrow(ValidationError)
  })
})

describe('hasField', () => {
  it('is true when the body carries the field, even set to null', () => {
    expect(hasField({ fromMonth: '2026-01' }, 'fromMonth')).toBe(true)
    expect(hasField({ fromMonth: null }, 'fromMonth')).toBe(true)
  })

  it('is false when the field is absent or the body is not an object', () => {
    expect(hasField({}, 'fromMonth')).toBe(false)
    expect(hasField(undefined, 'fromMonth')).toBe(false)
    expect(hasField(null, 'fromMonth')).toBe(false)
  })
})

describe('readRouteParam', () => {
  it('returns the value when present', () => {
    expect(readRouteParam('world', 'id')).toBe('world')
  })

  it('throws when the value is missing or empty', () => {
    expect(() => readRouteParam(undefined, 'id')).toThrow('Route parameter "id" is required')
    expect(() => readRouteParam('', 'id')).toThrow('Route parameter "id" is required')
  })
})

describe('readIntegerRouteParam', () => {
  it('returns the value as a number', () => {
    expect(readIntegerRouteParam('42', 'id')).toBe(42)
  })

  it('throws for a non-integer, negative or missing value', () => {
    expect(() => readIntegerRouteParam('abc', 'id')).toThrow(ValidationError)
    expect(() => readIntegerRouteParam('-1', 'id')).toThrow(ValidationError)
    expect(() => readIntegerRouteParam('1.5', 'id')).toThrow(ValidationError)
    expect(() => readIntegerRouteParam(undefined, 'id')).toThrow(ValidationError)
  })
})

describe('readMonthRouteParam', () => {
  it('returns the value when it matches YYYY-MM', () => {
    expect(readMonthRouteParam('2026-08', 'month')).toBe('2026-08')
  })

  it('throws for a malformed month', () => {
    expect(() => readMonthRouteParam('2026-8', 'month')).toThrow(ValidationError)
    expect(() => readMonthRouteParam(undefined, 'month')).toThrow(ValidationError)
  })
})

describe('readOptionalCents', () => {
  it('returns the integer when present', () => {
    expect(readOptionalCents({ amount: 500 }, 'amount')).toBe(500)
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalCents({}, 'amount')).toBeUndefined()
    expect(readOptionalCents({ amount: null }, 'amount')).toBeUndefined()
  })

  it('throws for a non-integer', () => {
    expect(() => readOptionalCents({ amount: 1.5 }, 'amount')).toThrow(ValidationError)
  })
})

describe('readOptionalDecimalString', () => {
  it('returns the string when present', () => {
    expect(readOptionalDecimalString({ nav: '14.8321' }, 'nav')).toBe('14.8321')
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalDecimalString({}, 'nav')).toBeUndefined()
    expect(readOptionalDecimalString({ nav: null }, 'nav')).toBeUndefined()
  })

  it('throws when it is a JSON number instead of a string', () => {
    expect(() => readOptionalDecimalString({ nav: 14.8 }, 'nav')).toThrow(ValidationError)
  })
})

describe('readOptionalIsoDate', () => {
  it('returns the date when present', () => {
    expect(readOptionalIsoDate({ date: '2026-08-03' }, 'date')).toBe('2026-08-03')
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalIsoDate({}, 'date')).toBeUndefined()
    expect(readOptionalIsoDate({ date: null }, 'date')).toBeUndefined()
  })

  it('throws for a malformed date', () => {
    expect(() => readOptionalIsoDate({ date: '2026-02-30' }, 'date')).toThrow(ValidationError)
  })
})

describe('readOptionalTiming', () => {
  it('returns the value when present', () => {
    expect(readOptionalTiming({ timing: 'end' }, 'timing')).toBe('end')
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalTiming({}, 'timing')).toBeUndefined()
    expect(readOptionalTiming({ timing: null }, 'timing')).toBeUndefined()
  })

  it('throws for an invalid value', () => {
    expect(() => readOptionalTiming({ timing: 'middle' }, 'timing')).toThrow(ValidationError)
  })
})

describe('readOptionalBoolean', () => {
  it('returns the value when present', () => {
    expect(readOptionalBoolean({ enabled: false }, 'enabled')).toBe(false)
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalBoolean({}, 'enabled')).toBeUndefined()
    expect(readOptionalBoolean({ enabled: null }, 'enabled')).toBeUndefined()
  })

  it('throws when the field is not a boolean', () => {
    expect(() => readOptionalBoolean({ enabled: 'true' }, 'enabled')).toThrow(ValidationError)
  })
})

describe('readOptionalWeights', () => {
  it('returns the weights when present and valid', () => {
    expect(readOptionalWeights({ weights: [{ fundId: 'world', weight: 1 }] }, 'weights'))
      .toEqual([{ fundId: 'world', weight: 1 }])
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalWeights({}, 'weights')).toBeUndefined()
    expect(readOptionalWeights({ weights: null }, 'weights')).toBeUndefined()
  })

  it('applies the same negative-weight rejection as readWeights', () => {
    expect(() => readOptionalWeights({ weights: [{ fundId: 'world', weight: 2 }, { fundId: 'emerging', weight: -1 }] }, 'weights'))
      .toThrow(ValidationError)
  })
})

describe('readOptionalMonth', () => {
  it('returns the month when present', () => {
    expect(readOptionalMonth({ throughMonth: '2026-08' }, 'throughMonth')).toBe('2026-08')
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalMonth({}, 'throughMonth')).toBeUndefined()
    expect(readOptionalMonth({ throughMonth: null }, 'throughMonth')).toBeUndefined()
  })

  it('applies the same format check as readMonth', () => {
    expect(() => readOptionalMonth({ throughMonth: '2026-13' }, 'throughMonth')).toThrow(ValidationError)
    expect(() => readOptionalMonth({ throughMonth: '2026-8' }, 'throughMonth'))
      .toThrow('Field "throughMonth" must be a month in the format YYYY-MM, received "2026-8"')
  })
})

describe('readOptionalStringArray', () => {
  it('returns the array when every item is a non-empty string', () => {
    expect(readOptionalStringArray({ fundIds: ['world', 'emerging'] }, 'fundIds')).toEqual(['world', 'emerging'])
  })

  it('returns undefined when missing or null', () => {
    expect(readOptionalStringArray({}, 'fundIds')).toBeUndefined()
    expect(readOptionalStringArray({ fundIds: null }, 'fundIds')).toBeUndefined()
  })

  it('returns an empty array unchanged, rather than treating it as absent', () => {
    expect(readOptionalStringArray({ fundIds: [] }, 'fundIds')).toEqual([])
  })

  it('throws when the field is not an array', () => {
    expect(() => readOptionalStringArray({ fundIds: 'world' }, 'fundIds'))
      .toThrow('Field "fundIds" must be an array of non-empty strings, received "world"')
  })

  it('throws when an item is not a string', () => {
    expect(() => readOptionalStringArray({ fundIds: ['world', 42] }, 'fundIds')).toThrow(ValidationError)
  })

  it('throws when an item is an empty string', () => {
    expect(() => readOptionalStringArray({ fundIds: ['world', ''] }, 'fundIds')).toThrow(ValidationError)
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
