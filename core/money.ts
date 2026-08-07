import type { Cents, Weight } from './types'

/**
 * Reparte un importe entre varios pesos sin perder ni inventar céntimos.
 *
 * Usa el método del resto mayor: asigna a cada destino la parte entera que le
 * corresponde y reparte los céntimos sobrantes entre los que tenían mayor parte
 * decimal. La suma del resultado es siempre exactamente `amount`.
 *
 * Repartir con `Math.round` en cada destino no sirve: 100 céntimos al 50/50 daría
 * 50 y 50, pero 101 daría 51 y 51, inventando un céntimo de la nada.
 */
export function split(amount: Cents, weights: Weight[]): Record<string, Cents> {
  if (!Number.isInteger(amount)) {
    throw new Error(`El importe debe ser un entero de céntimos, recibido ${amount}`)
  }
  if (amount < 0) {
    throw new Error(`El importe no puede ser negativo, recibido ${amount}`)
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  if (Math.abs(totalWeight - 1) > 1e-9) {
    throw new Error(`Los pesos deben sumar 1, suman ${totalWeight}`)
  }

  const parts = weights.map((w) => {
    const exact = amount * w.weight
    const floor = Math.floor(exact)
    return { fundId: w.fundId, floor, remainder: exact - floor }
  })

  const result: Record<string, Cents> = {}
  for (const part of parts) {
    result[part.fundId] = part.floor
  }

  let leftover = amount - parts.reduce((sum, p) => sum + p.floor, 0)

  // En caso de empate en el resto, gana el que aparece antes en la lista:
  // `sort` es estable en JavaScript desde ES2019.
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder)
  for (let i = 0; leftover > 0; i++, leftover--) {
    const target = byRemainder[i % byRemainder.length]!
    result[target.fundId]! += 1
  }

  return result
}
