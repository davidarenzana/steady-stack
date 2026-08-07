import Decimal from './decimal'

/**
 * Tasa mensual equivalente a una tasa anual: `(1 + r)^(1/12) - 1`.
 *
 * No es `r / 12`. Un 9 % anual dividido entre doce da un 0,75 % mensual que,
 * compuesto doce veces, produce un 9,381 % real: el atajo regala rentabilidad.
 * La tasa correcta es 0,7207 %. Es la misma distinción que hay entre el TIN y
 * la TAE de un préstamo.
 *
 * Sobre el horizonte de esta cartera (25 años al 9 %) el atajo sobreestimaba
 * el resultado en 14.415 €.
 *
 * @param annualRate tasa anual en tanto por uno (0.09 para un 9 %)
 */
export function monthlyRate(annualRate: number): Decimal {
  if (annualRate < -1) {
    throw new Error(`La tasa anual no puede ser inferior a -100 %, recibida ${annualRate}`)
  }

  return new Decimal(1).plus(annualRate).pow(new Decimal(1).div(12)).minus(1)
}
