import Decimal from 'decimal.js'

/**
 * Punto único de configuración de la precisión decimal del proyecto.
 *
 * 28 dígitos significativos: sobra para 300 meses de capitalización compuesta
 * sin que el error de redondeo llegue nunca al céntimo.
 */
Decimal.set({ precision: 28 })

export default Decimal
