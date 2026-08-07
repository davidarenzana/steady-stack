import Decimal from 'decimal.js'

/**
 * The single place where the project's decimal precision is configured.
 *
 * 28 significant digits: more than enough for 300 months of compounding without
 * the rounding error ever reaching a cent.
 */
Decimal.set({ precision: 28 })

export default Decimal
