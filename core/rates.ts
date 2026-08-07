import Decimal from './decimal'

/**
 * The monthly rate equivalent to an annual rate: `(1 + r)^(1/12) - 1`.
 *
 * It is not `r / 12`. A 9 % annual rate divided by twelve gives a 0,75 % monthly
 * rate which, compounded twelve times, produces a real 9,381 %: the shortcut gives
 * away return. The correct rate is 0,7207 %. It is the same distinction as the one
 * between the nominal rate and the APR on a loan.
 *
 * Over this portfolio's horizon (25 years at 9 %) the shortcut overstated the
 * result by 14.415 €.
 *
 * @param annualRate annual rate as a fraction of one (0.09 for 9 %)
 */
export function monthlyRate(annualRate: number): Decimal {
  if (annualRate < -1) {
    throw new Error(`Annual rate cannot be below -100 %, received ${annualRate}`)
  }

  return new Decimal(1).plus(annualRate).pow(new Decimal(1).div(12)).minus(1)
}
