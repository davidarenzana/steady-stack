import { describe, expect, it } from 'vitest'
import { expandContributions } from './contributions'
import type { ContributionOverride, ContributionRule } from './types'

const WEIGHTS = [
  { fundId: 'world', weight: 0.8 },
  { fundId: 'emerging', weight: 0.2 },
]

/** La regla real de la cartera: 200 €/mes desde agosto de 2026. */
const MONTHLY: ContributionRule = {
  fromMonth: '2026-08',
  amount: 20_000,
  timing: 'inicio',
  weights: WEIGHTS,
}

describe('expandContributions', () => {
  it('genera un mes por cada mes del rango', () => {
    const result = expandContributions([MONTHLY], [], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(result.every((c) => c.amount === 20_000)).toBe(true)
    expect(result.every((c) => c.timing === 'inicio')).toBe(true)
  })

  it('ignora los meses anteriores al inicio de la regla', () => {
    const result = expandContributions([MONTHLY], [], '2026-05', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it('aplica la regla más reciente que ya esté vigente', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }
    const result = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-11', 20_000],
      ['2026-12', 20_000],
      ['2027-01', 40_000],
      ['2027-02', 40_000],
    ])
  })

  it('subir la aportación no reescribe el pasado', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const before = expandContributions([MONTHLY], [], '2026-08', '2026-12')
    const after = expandContributions([MONTHLY, raise], [], '2026-08', '2026-12')

    expect(after).toEqual(before)
  })

  it('no depende del orden en que lleguen las reglas', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const ordered = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')
    const shuffled = expandContributions([raise, MONTHLY], [], '2026-11', '2027-02')

    expect(shuffled).toEqual(ordered)
  })

  it('una excepción con importe sustituye al de la regla', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000, note: 'paga extra' }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-08', 20_000],
      ['2026-09', 20_000],
      ['2026-10', 150_000],
      ['2026-11', 20_000],
    ])
  })

  it('una excepción con importe nulo salta el mes', () => {
    const skip: ContributionOverride = { month: '2026-10', amount: null, note: 'mes sin liquidez' }
    const result = expandContributions([MONTHLY], [skip], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-11'])
  })

  it('una excepción puede cambiar el momento de la aportación', () => {
    const late: ContributionOverride = { month: '2026-10', amount: 20_000, timing: 'fin' }
    const result = expandContributions([MONTHLY], [late], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.timing).toBe('fin')
    expect(result.find((c) => c.month === '2026-09')?.timing).toBe('inicio')
  })

  it('una excepción hereda los pesos de la regla vigente', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000 }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.weights).toEqual(WEIGHTS)
  })

  it('ignora una excepción de un mes sin regla vigente', () => {
    const orphan: ContributionOverride = { month: '2026-05', amount: 50_000 }
    const result = expandContributions([MONTHLY], [orphan], '2026-01', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it('reproduce el arranque real de la cartera', () => {
    // 2.000 € iniciales en julio, más la regla de 200 €/mes desde agosto.
    const initial: ContributionRule = {
      fromMonth: '2026-07',
      amount: 200_000,
      timing: 'inicio',
      weights: WEIGHTS,
    }
    // Desde agosto, MONTHLY es la regla más reciente y sustituye a la inicial
    // sin necesidad de ninguna excepción.
    const result = expandContributions([initial, MONTHLY], [], '2026-07', '2026-09')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-07', 200_000],
      ['2026-08', 20_000],
      ['2026-09', 20_000],
    ])
  })

  it('devuelve una lista vacía si no hay reglas', () => {
    expect(expandContributions([], [], '2026-08', '2026-11')).toEqual([])
  })

  it('rechaza dos reglas con el mismo mes de inicio', () => {
    const duplicate: ContributionRule = { ...MONTHLY, amount: 10_000 }

    expect(() => expandContributions([MONTHLY, duplicate], [], '2026-08', '2026-11')).toThrow(
      'Hay dos reglas de aportación con el mismo mes de inicio: "2026-08"',
    )
  })

  it('rechaza el duplicado en ambos órdenes del array', () => {
    const duplicate: ContributionRule = { ...MONTHLY, amount: 10_000 }

    expect(() => expandContributions([MONTHLY, duplicate], [], '2026-08', '2026-11')).toThrow(
      'Hay dos reglas de aportación con el mismo mes de inicio: "2026-08"',
    )
    expect(() => expandContributions([duplicate, MONTHLY], [], '2026-08', '2026-11')).toThrow(
      'Hay dos reglas de aportación con el mismo mes de inicio: "2026-08"',
    )
  })

  it('no lanza cuando los meses de inicio son distintos', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    expect(() => expandContributions([MONTHLY, raise], [], '2026-08', '2027-02')).not.toThrow()
  })

  it('una excepción de importe cero aparece en la serie, no se salta', () => {
    const zero: ContributionOverride = { month: '2026-10', amount: 0, note: 'importe cero' }
    const result = expandContributions([MONTHLY], [zero], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(result.find((c) => c.month === '2026-10')?.amount).toBe(0)
  })

  it('una regla, un mes saltado y un extra producen la serie correcta (sección 11 del spec)', () => {
    const skip: ContributionOverride = { month: '2026-09', amount: null, note: 'mes sin liquidez' }
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000, note: 'paga extra' }
    const result = expandContributions([MONTHLY], [skip, extra], '2026-08', '2026-11')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-08', 20_000],
      ['2026-10', 150_000],
      ['2026-11', 20_000],
    ])
  })
})
