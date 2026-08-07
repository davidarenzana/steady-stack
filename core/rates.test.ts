import { describe, expect, it } from 'vitest'
import { monthlyRate } from './rates'
import Decimal from './decimal'

describe('monthlyRate', () => {
  it('un 9 % anual compuesto doce veces devuelve exactamente un 9 %', () => {
    const rate = monthlyRate(0.09)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(afterTwelveMonths.toFixed(2)).toBe('1090.00')
  })

  it('un 5 % anual compuesto doce veces devuelve exactamente un 5 %', () => {
    const rate = monthlyRate(0.05)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(afterTwelveMonths.toFixed(2)).toBe('1050.00')
  })

  it('no es la división r/12', () => {
    // El atajo r/12 daría 0,0075 y produciría 1.093,81 € en vez de 1.090,00 €.
    const rate = monthlyRate(0.09)

    expect(rate.toFixed(6)).toBe('0.007207')
    expect(rate.toNumber()).not.toBeCloseTo(0.09 / 12, 6)
  })

  it('una tasa del 0 % no genera rendimiento', () => {
    const rate = monthlyRate(0)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(rate.toNumber()).toBe(0)
    expect(afterTwelveMonths.toFixed(2)).toBe('1000.00')
  })

  it('acepta tasas negativas', () => {
    const rate = monthlyRate(-0.1)
    const afterTwelveMonths = new Decimal(1_000).times(rate.plus(1).pow(12))

    expect(rate.toNumber()).toBeLessThan(0)
    expect(afterTwelveMonths.toFixed(2)).toBe('900.00')
  })

  it('rechaza una tasa que destruiría más del capital', () => {
    expect(() => monthlyRate(-1.5)).toThrow('La tasa anual no puede ser inferior a -100 %')
  })
})
