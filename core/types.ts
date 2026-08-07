/** Importe monetario en céntimos enteros. Nunca euros en coma flotante. */
export type Cents = number

/** Mes en formato `YYYY-MM`. Ordena lexicográficamente igual que cronológicamente. */
export type Month = string

/** Fecha en formato `YYYY-MM-DD`. */
export type IsoDate = string

/**
 * Momento de la aportación dentro del mes. Determina si devenga rendimiento
 * en su mes de llegada dentro de las proyecciones teóricas.
 */
export type Timing = 'inicio' | 'fin'

export interface Weight {
  fundId: string
  /** Peso en tanto por uno. Los pesos de un reparto deben sumar 1. */
  weight: number
}

/** Regla de aportación periódica. Rige desde `fromMonth` hasta que otra la sustituya. */
export interface ContributionRule {
  fromMonth: Month
  amount: Cents
  timing: Timing
  weights: Weight[]
}

/** Excepción puntual a la regla vigente en un mes concreto. */
export interface ContributionOverride {
  month: Month
  /** `null` significa mes saltado: ese mes no hay aportación. */
  amount: Cents | null
  /** Si se omite, hereda el de la regla vigente. */
  timing?: Timing
  note?: string
}

/** Aportación ya resuelta para un mes concreto. */
export interface Contribution {
  month: Month
  amount: Cents
  timing: Timing
  weights: Weight[]
}
