import { describe, expect, it } from 'vitest'
import { split } from './money'

describe('split', () => {
  it('reparte 200 € al 80/20 en 160 € y 40 €', () => {
    const result = split(20_000, [
      { fundId: 'world', weight: 0.8 },
      { fundId: 'emerging', weight: 0.2 },
    ])

    expect(result).toEqual({ world: 16_000, emerging: 4_000 })
  })

  it('reparte los 2.000 € iniciales al 80/20', () => {
    const result = split(200_000, [
      { fundId: 'world', weight: 0.8 },
      { fundId: 'emerging', weight: 0.2 },
    ])

    expect(result).toEqual({ world: 160_000, emerging: 40_000 })
  })

  it('no pierde ni inventa céntimos cuando el reparto no es exacto', () => {
    const result = split(10_000, [
      { fundId: 'a', weight: 1 / 3 },
      { fundId: 'b', weight: 1 / 3 },
      { fundId: 'c', weight: 1 / 3 },
    ])

    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
    // `sort()` sin comparador ordenaría como cadenas: aquí hace falta el numérico.
    expect(Object.values(result).sort((a, b) => a - b)).toEqual([3_333, 3_333, 3_334])
  })

  it('asigna el céntimo sobrante al peso con mayor resto', () => {
    // 1.001 céntimos al 50/50: 500,5 cada uno. Empate: gana el primero.
    const result = split(1_001, [
      { fundId: 'a', weight: 0.5 },
      { fundId: 'b', weight: 0.5 },
    ])

    expect(result).toEqual({ a: 501, b: 500 })
  })

  it('reparte un importe de cero sin romperse', () => {
    const result = split(0, [
      { fundId: 'a', weight: 0.8 },
      { fundId: 'b', weight: 0.2 },
    ])

    expect(result).toEqual({ a: 0, b: 0 })
  })

  it('rechaza importes que no son céntimos enteros', () => {
    expect(() => split(100.5, [{ fundId: 'a', weight: 1 }]))
      .toThrow('El importe debe ser un entero de céntimos')
  })

  it('rechaza importes negativos', () => {
    expect(() => split(-100, [{ fundId: 'a', weight: 1 }]))
      .toThrow('El importe no puede ser negativo')
  })

  it('rechaza pesos que no suman 1', () => {
    expect(() => split(10_000, [
      { fundId: 'a', weight: 0.8 },
      { fundId: 'b', weight: 0.1 },
    ])).toThrow('Los pesos deben sumar 1')
  })

  it('rechaza una lista de pesos vacía', () => {
    expect(() => split(10_000, [])).toThrow('Los pesos deben sumar 1')
  })
})
