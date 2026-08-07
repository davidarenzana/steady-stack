/** A monetary amount in integer cents. Never euros in floating point. */
export type Cents = number

/** A month as `YYYY-MM`. Sorts lexicographically the same as chronologically. */
export type Month = string

/** A date as `YYYY-MM-DD`. */
export type IsoDate = string

/**
 * When within the month the contribution lands. Decides whether it earns a
 * return in its arrival month in the theoretical projections.
 */
export type Timing = 'start' | 'end'

export interface Weight {
  fundId: string
  /** Weight as a fraction of one. The weights of a split must add up to 1. */
  weight: number
}

/** A recurring contribution rule. Governs from `fromMonth` until another supersedes it. */
export interface ContributionRule {
  fromMonth: Month
  amount: Cents
  timing: Timing
  weights: Weight[]
}

/** A one-off exception to the rule in force in a given month. */
export interface ContributionOverride {
  month: Month
  /** `null` means a skipped month: no contribution that month. */
  amount: Cents | null
  /** If omitted, inherits the one from the rule in force. */
  timing?: Timing
  note?: string
}

/** A contribution already resolved for a given month. */
export interface Contribution {
  month: Month
  amount: Cents
  timing: Timing
  weights: Weight[]
}
