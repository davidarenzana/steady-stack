import { describe, expect, it } from 'vitest'
import { addMonths, monthRange } from './months'

describe('addMonths', () => {
  it('avanza dentro del mismo año', () => {
    expect(addMonths('2026-08', 3)).toBe('2026-11')
  })

  it('cruza el cambio de año', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  it('retrocede', () => {
    expect(addMonths('2026-02', -3)).toBe('2025-11')
  })

  it('avanza muchos años de golpe', () => {
    expect(addMonths('2026-08', 300)).toBe('2051-08')
  })

  it('rechaza un formato de mes inválido', () => {
    expect(() => addMonths('2026-8', 1)).toThrow('Mes inválido')
    expect(() => addMonths('2026-13', 1)).toThrow('Mes inválido')
  })
})

describe('monthRange', () => {
  it('incluye ambos extremos', () => {
    expect(monthRange('2026-07', '2026-10')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('devuelve un único mes cuando los extremos coinciden', () => {
    expect(monthRange('2026-07', '2026-07')).toEqual(['2026-07'])
  })

  it('devuelve una lista vacía si el final es anterior al inicio', () => {
    expect(monthRange('2026-10', '2026-07')).toEqual([])
  })

  it('cubre el horizonte de 25 años del spec', () => {
    expect(monthRange('2026-07', '2051-07')).toHaveLength(301)
  })
})
