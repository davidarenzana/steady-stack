# Plan de implementación — Fundación y motor de cálculo

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea a tarea.
> Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** dejar el proyecto arrancado y el motor financiero completo, probado y aislado, sin
base de datos, sin red y sin interfaz.

**Arquitectura:** todo el cálculo vive en `core/`, como funciones puras que no importan Nuxt,
Drizzle ni nada de red. Los importes viajan en céntimos enteros; los valores liquidativos y las
participaciones, como cadenas decimales manipuladas con `decimal.js`. Cada módulo tiene una
responsabilidad y su fichero de test al lado.

**Stack:** Node 22.14 · pnpm 11.8 · Nuxt 4.5 · TypeScript · decimal.js · Vitest

**Spec de referencia:** `docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md`

## Restricciones globales

Aplican a todas las tareas, sin excepción:

- **Gestor de paquetes: `pnpm`.** Nunca `npm` ni `yarn`.
- **Importes monetarios: enteros en céntimos** (`Cents = number`, siempre entero). Jamás
  `number` en euros con decimales. Prohibido `parseFloat` sobre dinero.
- **Valores liquidativos y participaciones: cadenas decimales** manipuladas con `decimal.js`.
- **Tasa mensual: `(1 + r)^(1/12) - 1`.** Nunca `r / 12`.
- **`core/` es puro:** no importa Nuxt, ni Drizzle, ni hace red, ni lee ficheros, ni consulta el
  reloj del sistema. Todas las fechas entran por parámetro.
- **Un reparto suma el total exacto.** 200 € al 80/20 son 160 € y 40 €. Ningún céntimo se pierde
  ni se duplica.
- **Idioma:** todo en inglés — identificadores, comentarios, JSDoc, nombres de test y mensajes de
  error. Las cifras en prosa mantienen la ortotipografía española (`1.090,00 €`, `9 %`); el texto de
  interfaz va en castellano. Los ejemplos de código de este plan están en castellano porque se
  escribieron antes de la regla: **traduce al implementarlos.** Ver la sección 12 del spec.
- **TDD:** el test se escribe primero y **se ejecuta para verlo fallar** antes de escribir la
  implementación. Un test que pasa antes de existir el código no prueba nada.
- **Formato de mes:** `YYYY-MM`. Ordena lexicográficamente igual que cronológicamente, así que
  comparar meses es comparar cadenas.
- **Formato de fecha:** `YYYY-MM-DD`.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `core/types.ts` | Tipos compartidos del dominio. Sin lógica |
| `core/decimal.ts` | Instancia de `Decimal` configurada. Punto único de precisión |
| `core/money.ts` | Aritmética de céntimos y reparto exacto por pesos |
| `core/rates.ts` | Conversión de tasa anual a mensual |
| `core/months.ts` | Aritmética de meses `YYYY-MM` |
| `core/contributions.ts` | Reglas + excepciones → serie de aportaciones |
| `core/scenarios.ts` | Aportaciones + tasa → serie proyectada |
| `core/purchases.ts` | Aportación + VL → participaciones compradas |
| `core/valuation.ts` | Participaciones + VL → valor, plusvalía, coste medio |
| `core/returns.ts` | Flujos de caja → XIRR |

---

## Tarea 1: Andamiaje del proyecto — COMPLETADA

Ejecutada el 2026-08-06. Se instaló el stack completo del spec, no solo lo mínimo del motor
de cálculo, para no volver a parar por instalaciones en los planes 2 y 3.

**Verificado:** `pnpm test` (2 en verde), `pnpm typecheck` (exit 0), `pnpm build` (exit 0),
`pnpm dev` sirve la home con HTTP 200.

### Tres cosas que no salieron a la primera

**1. TypeScript hay que fijarlo a la 5.x.** `pnpm add -D typescript` resuelve a la **7.0.2**, el
compilador nativo en Go, que ya no exporta `typescript/lib/tsc`. `vue-tsc` lo necesita y
`pnpm typecheck` muere con `ERR_PACKAGE_PATH_NOT_EXPORTED`. Está fijado a `5.9.3`. **No lo subas
a la 7 hasta que vue-tsc lo soporte.**

**2. pnpm 11 bloquea los scripts de instalación** y ya no lee el campo `pnpm` de `package.json`:
la configuración vive en `pnpm-workspace.yaml` bajo la clave `allowBuilds`, con booleanos por
paquete. `maplibre-gl` se deniega a propósito — entra como dependencia transitiva de Unovis por
sus componentes de mapa, que no usamos. `better-sqlite3` resultó no necesitar compilación: trae
binarios precompilados.

**3. `shadcn-vue init` genera un tema incompleto.** En la versión 2.8.1, el estilo `vega` trae
`cssVars: {}` vacío: deja la hoja referenciando `bg-background` y `border-border` sin declarar
ninguna variable, y `pnpm build` falla con *Cannot apply unknown utility class*. Añadir
componentes tampoco las inyecta. El tema de `app/assets/css/tailwind.css` está **escrito a mano**:
neutros en OKLCH con desviación fría (tono 258), modo claro y oscuro, y `--chart-1..5`. Si vuelves
a ejecutar el CLI con `--force`, lo sobrescribirá.

### Estado resultante

```
package.json          scripts: dev, build, preview, postinstall, test, test:watch, typecheck
pnpm-workspace.yaml   allowBuilds
nuxt.config.ts        shadcn-nuxt, @tailwindcss/vite, css
tsconfig.json         alias ~/ @/ ~~/ #core/
vitest.config.ts      dos proyectos: core (node) y app (happy-dom, vacío hasta el plan 3)
components.json       shadcn-vue: estilo reka-vega, base mist, iconos lucide
app/app.vue           NuxtRouteAnnouncer + NuxtPage
app/pages/index.vue   marcador de posición
app/lib/utils.ts      cn() de shadcn-vue
app/components/ui/button/   Button de prueba, verifica que la cadena funciona
core/smoke.test.ts    2 tests
core/  server/{api,db,providers}/  data/    vacíos, con .gitkeep
```

Iconos: **`@lucide/vue`**, no `lucide-vue-next`, que está deprecado.

---

## Tarea 2: Tipos del dominio y reparto exacto de importes — COMPLETADA

**Ficheros:**
- Crear: `core/types.ts`
- Crear: `core/money.ts`
- Crear: `core/money.test.ts`

**Interfaces:**
- Consume: nada
- Produce:
  - `type Cents = number` (siempre entero)
  - `type Month = string` (`'YYYY-MM'`)
  - `type Timing = 'start' | 'end'`
  - `interface Weight { fundId: string; weight: number }`
  - `interface ContributionRule { fromMonth: Month; amount: Cents; timing: Timing; weights: Weight[] }`
  - `interface ContributionOverride { month: Month; amount: Cents | null; timing?: Timing; note?: string }`
  - `interface Contribution { month: Month; amount: Cents; timing: Timing; weights: Weight[] }`
  - `function split(amount: Cents, weights: Weight[]): Record<string, Cents>`

- [x] **Paso 1: Escribir el test que falla**

Crear `core/money.test.ts`:

```ts
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
```

- [x] **Paso 2: Ejecutar el test y verlo fallar**

Ejecuta: `pnpm test core/money.test.ts`
Esperado: FALLA con un error de resolución del módulo `./money`, que todavía no existe.

- [x] **Paso 3: Crear `core/types.ts`**

```ts
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
export type Timing = 'start' | 'end'

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
```

- [x] **Paso 4: Crear `core/money.ts`**

```ts
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
```

- [x] **Paso 5: Ejecutar el test y verlo pasar**

Ejecuta: `pnpm test core/money.test.ts`
Esperado: 9 tests en verde.

- [x] **Paso 6: Commit**

```bash
git add core/types.ts core/money.ts core/money.test.ts
git commit -m "Tipos del dominio y reparto exacto por pesos

El reparto usa el método del resto mayor para que la suma cuadre siempre
con el importe original. Redondear cada parte por separado inventaría o
perdería céntimos."
```

---

## Tarea 3: Conversión de tasa anual a mensual — COMPLETADA

Commit `c0b7787`. El plan pedía 6 tests; hay 7: la auditoría añadió la frontera exacta del -100 %,
que se acepta y aniquila el capital.

**Ficheros:**
- Crear: `core/decimal.ts`
- Crear: `core/rates.ts`
- Crear: `core/rates.test.ts`

**Interfaces:**
- Consume: nada
- Produce:
  - `core/decimal.ts` exporta por defecto una clase `Decimal` con precisión 28
  - `function monthlyRate(annualRate: number): Decimal`

Esta es la tarea donde vive la decisión financiera central del proyecto. La sección 5 del spec
explica por qué `r / 12` está mal.

- [x] **Paso 1: Escribir el test que falla**

Crear `core/rates.test.ts`:

```ts
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
```

- [x] **Paso 2: Ejecutar el test y verlo fallar**

Ejecuta: `pnpm test core/rates.test.ts`
Esperado: FALLA por no resolverse `./rates` ni `./decimal`.

- [x] **Paso 3: Crear `core/decimal.ts`**

```ts
import Decimal from 'decimal.js'

/**
 * Punto único de configuración de la precisión decimal del proyecto.
 *
 * 28 dígitos significativos: sobra para 300 meses de capitalización compuesta
 * sin que el error de redondeo llegue nunca al céntimo.
 */
Decimal.set({ precision: 28 })

export default Decimal
```

- [x] **Paso 4: Crear `core/rates.ts`**

```ts
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
```

- [x] **Paso 5: Ejecutar el test y verlo pasar**

Ejecuta: `pnpm test core/rates.test.ts`
Esperado: 6 tests en verde. El primero es el invariante que cita la sección 11 del spec.

- [x] **Paso 6: Commit**

```bash
git add core/decimal.ts core/rates.ts core/rates.test.ts
git commit -m "Tasa mensual por equivalencia compuesta, no por división

(1+r)^(1/12)-1 en lugar de r/12. El atajo convierte un 9 % declarado en un
9,381 % real y sobreestima 14.415 € a 25 años. El test lo fija: 1.000 €
compuestos doce veces dan 1.090,00 € exactos."
```

---

## Tarea 4: Aritmética de meses y expansión de aportaciones — COMPLETADA

Commits `0115cfd` y `894ae4d`. La auditoría encontró dos defectos que se corrigieron en el segundo:
dos reglas con el mismo `fromMonth` hacían que el importe dependiera del orden del array, y
`addMonths` aceptaba un `count` fraccional devolviendo `2026-2.5`. Ambos lanzan ahora.

**Ficheros:**
- Crear: `core/months.ts`
- Crear: `core/months.test.ts`
- Crear: `core/contributions.ts`
- Crear: `core/contributions.test.ts`

**Interfaces:**
- Consume: `Month`, `Cents`, `ContributionRule`, `ContributionOverride`, `Contribution` de `core/types.ts`
- Produce:
  - `function addMonths(month: Month, count: number): Month`
  - `function monthRange(from: Month, to: Month): Month[]`
  - `function expandContributions(rules: ContributionRule[], overrides: ContributionOverride[], from: Month, to: Month): Contribution[]`

- [x] **Paso 1: Escribir el test de meses**

Crear `core/months.test.ts`:

```ts
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
```

- [x] **Paso 2: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/months.test.ts`
Esperado: FALLA por no resolverse `./months`.

- [x] **Paso 3: Crear `core/months.ts`**

```ts
import type { Month } from './types'

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function parse(month: Month): { year: number, monthIndex: number } {
  const match = MONTH_PATTERN.exec(month)
  if (!match) {
    throw new Error(`Mes inválido: "${month}". Se espera el formato YYYY-MM`)
  }
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 }
}

function format(year: number, monthIndex: number): Month {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** Desplaza un mes `count` posiciones. Acepta valores negativos. */
export function addMonths(month: Month, count: number): Month {
  const { year, monthIndex } = parse(month)
  const absolute = year * 12 + monthIndex + count
  return format(Math.floor(absolute / 12), ((absolute % 12) + 12) % 12)
}

/**
 * Lista de meses consecutivos entre dos extremos, ambos incluidos.
 * Devuelve una lista vacía si `to` es anterior a `from`.
 */
export function monthRange(from: Month, to: Month): Month[] {
  parse(from)
  parse(to)

  const months: Month[] = []
  let current = from
  while (current <= to) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}
```

- [x] **Paso 4: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/months.test.ts`
Esperado: 9 tests en verde.

- [x] **Paso 5: Escribir el test de aportaciones**

Crear `core/contributions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandContributions } from './contributions'
import type { ContributionOverride, ContributionRule } from './types'

const WEIGHTS = [
  { fundId: 'world', weight: 0.8 },
  { fundId: 'emerging', weight: 0.2 },
]

/** La regla real de la cartera: 200 €/mes desde agosto de 2026. */
const MONTHLY: ContributionRule = {
  fromMonth: '2026-08',
  amount: 20_000,
  timing: 'start',
  weights: WEIGHTS,
}

describe('expandContributions', () => {
  it('genera un mes por cada mes del rango', () => {
    const result = expandContributions([MONTHLY], [], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(result.every((c) => c.amount === 20_000)).toBe(true)
    expect(result.every((c) => c.timing === 'start')).toBe(true)
  })

  it('ignora los meses anteriores al inicio de la regla', () => {
    const result = expandContributions([MONTHLY], [], '2026-05', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it('aplica la regla más reciente que ya esté vigente', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }
    const result = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-11', 20_000],
      ['2026-12', 20_000],
      ['2027-01', 40_000],
      ['2027-02', 40_000],
    ])
  })

  it('subir la aportación no reescribe el pasado', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const before = expandContributions([MONTHLY], [], '2026-08', '2026-12')
    const after = expandContributions([MONTHLY, raise], [], '2026-08', '2026-12')

    expect(after).toEqual(before)
  })

  it('no depende del orden en que lleguen las reglas', () => {
    const raise: ContributionRule = { ...MONTHLY, fromMonth: '2027-01', amount: 40_000 }

    const ordered = expandContributions([MONTHLY, raise], [], '2026-11', '2027-02')
    const shuffled = expandContributions([raise, MONTHLY], [], '2026-11', '2027-02')

    expect(shuffled).toEqual(ordered)
  })

  it('una excepción con importe sustituye al de la regla', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000, note: 'paga extra' }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-08', 20_000],
      ['2026-09', 20_000],
      ['2026-10', 150_000],
      ['2026-11', 20_000],
    ])
  })

  it('una excepción con importe nulo salta el mes', () => {
    const skip: ContributionOverride = { month: '2026-10', amount: null, note: 'mes sin liquidez' }
    const result = expandContributions([MONTHLY], [skip], '2026-08', '2026-11')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09', '2026-11'])
  })

  it('una excepción puede cambiar el momento de la aportación', () => {
    const late: ContributionOverride = { month: '2026-10', amount: 20_000, timing: 'end' }
    const result = expandContributions([MONTHLY], [late], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.timing).toBe('end')
    expect(result.find((c) => c.month === '2026-09')?.timing).toBe('start')
  })

  it('una excepción hereda los pesos de la regla vigente', () => {
    const extra: ContributionOverride = { month: '2026-10', amount: 150_000 }
    const result = expandContributions([MONTHLY], [extra], '2026-08', '2026-11')

    expect(result.find((c) => c.month === '2026-10')?.weights).toEqual(WEIGHTS)
  })

  it('ignora una excepción de un mes sin regla vigente', () => {
    const orphan: ContributionOverride = { month: '2026-05', amount: 50_000 }
    const result = expandContributions([MONTHLY], [orphan], '2026-01', '2026-09')

    expect(result.map((c) => c.month)).toEqual(['2026-08', '2026-09'])
  })

  it('reproduce el arranque real de la cartera', () => {
    // 2.000 € iniciales en julio, más la regla de 200 €/mes desde agosto.
    const initial: ContributionRule = {
      fromMonth: '2026-07',
      amount: 200_000,
      timing: 'start',
      weights: WEIGHTS,
    }
    // Desde agosto, MONTHLY es la regla más reciente y sustituye a la inicial
    // sin necesidad de ninguna excepción.
    const result = expandContributions([initial, MONTHLY], [], '2026-07', '2026-09')

    expect(result.map((c) => [c.month, c.amount])).toEqual([
      ['2026-07', 200_000],
      ['2026-08', 20_000],
      ['2026-09', 20_000],
    ])
  })

  it('devuelve una lista vacía si no hay reglas', () => {
    expect(expandContributions([], [], '2026-08', '2026-11')).toEqual([])
  })
})
```

- [x] **Paso 6: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/contributions.test.ts`
Esperado: FALLA por no resolverse `./contributions`.

- [x] **Paso 7: Crear `core/contributions.ts`**

```ts
import { monthRange } from './months'
import type { Contribution, ContributionOverride, ContributionRule, Month } from './types'

/**
 * Devuelve la regla vigente en un mes: la de `fromMonth` más tardío que no sea
 * posterior al mes consultado. `undefined` si ninguna regla ha entrado aún en vigor.
 */
function ruleFor(rules: ContributionRule[], month: Month): ContributionRule | undefined {
  let active: ContributionRule | undefined
  for (const rule of rules) {
    if (rule.fromMonth <= month && (!active || rule.fromMonth > active.fromMonth)) {
      active = rule
    }
  }
  return active
}

/**
 * Expande reglas y excepciones en la serie de aportaciones de un rango de meses.
 *
 * Las aportaciones son derivadas, no almacenadas: cambiar una regla recalcula la
 * serie sin tocar el histórico de compras ya materializadas.
 *
 * Una excepción con `amount: null` salta el mes. Una excepción de un mes en el que
 * no hay regla vigente se ignora: sin regla no hay pesos con los que repartirla.
 */
export function expandContributions(
  rules: ContributionRule[],
  overrides: ContributionOverride[],
  from: Month,
  to: Month,
): Contribution[] {
  const overrideByMonth = new Map(overrides.map((o) => [o.month, o]))
  const contributions: Contribution[] = []

  for (const month of monthRange(from, to)) {
    const rule = ruleFor(rules, month)
    if (!rule) continue

    const override = overrideByMonth.get(month)
    if (override && override.amount === null) continue

    contributions.push({
      month,
      amount: override?.amount ?? rule.amount,
      timing: override?.timing ?? rule.timing,
      weights: rule.weights,
    })
  }

  return contributions
}
```

- [x] **Paso 8: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/contributions.test.ts`
Esperado: 12 tests en verde.

- [x] **Paso 9: Commit**

```bash
git add core/months.ts core/months.test.ts core/contributions.ts core/contributions.test.ts
git commit -m "Aritmética de meses y expansión de aportaciones

Las aportaciones se derivan de reglas más excepciones en lugar de
almacenarse. Un test fija que añadir una regla nueva no altera los meses
que ya regía la anterior."
```

---

## Tarea 5: Proyección de escenarios

**Ficheros:**
- Crear: `core/scenarios.ts`
- Crear: `core/scenarios.test.ts`

**Interfaces:**
- Consume: `monthlyRate` de `core/rates.ts`, `Contribution`/`Cents`/`Month` de `core/types.ts`
- Produce:
  - `interface ScenarioPoint { month: Month; balance: Cents; contributed: Cents }`
  - `function projectScenario(contributions: Contribution[], annualRate: number, months: Month[]): ScenarioPoint[]`

La fórmula, copiada de la sección 5 del spec:

```
saldo(n) = (saldo(n-1) + aportaciones_inicio(n)) * (1 + r_mensual) + aportaciones_fin(n)
```

- [ ] **Paso 1: Escribir el test que falla**

Crear `core/scenarios.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { projectScenario } from './scenarios'
import { monthRange } from './months'
import type { Contribution } from './types'

const NO_WEIGHTS: Contribution['weights'] = []

function contribution(month: string, amount: number, timing: 'start' | 'end' = 'start'): Contribution {
  return { month, amount, timing, weights: NO_WEIGHTS }
}

describe('projectScenario', () => {
  it('1.000 € al 9 % durante doce meses dan 1.090,00 €', () => {
    const months = monthRange('2026-01', '2026-12')
    const result = projectScenario([contribution('2026-01', 100_000)], 0.09, months)

    expect(result).toHaveLength(12)
    expect(result[11]!.balance).toBe(109_000)
  })

  it('una aportación de fin de mes no devenga en su mes de llegada', () => {
    const months = monthRange('2026-01', '2026-12')
    const atStart = projectScenario([contribution('2026-01', 100_000, 'start')], 0.09, months)
    const atEnd = projectScenario([contribution('2026-01', 100_000, 'end')], 0.09, months)

    // La de inicio capitaliza doce meses; la de fin, once.
    expect(atStart[11]!.balance).toBe(109_000)
    expect(atEnd[11]!.balance).toBeLessThan(atStart[11]!.balance)
    expect(atEnd[0]!.balance).toBe(100_000)
  })

  it('una tasa del 0 % devuelve la aportación acumulada sin más', () => {
    const months = monthRange('2026-08', '2026-12')
    const contributions = months.map((m) => contribution(m, 20_000))
    const result = projectScenario(contributions, 0, months)

    expect(result.map((p) => p.balance)).toEqual([20_000, 40_000, 60_000, 80_000, 100_000])
  })

  it('acumula el total aportado en paralelo al saldo', () => {
    const months = monthRange('2026-08', '2026-10')
    const contributions = months.map((m) => contribution(m, 20_000))
    const result = projectScenario(contributions, 0.09, months)

    expect(result.map((p) => p.contributed)).toEqual([20_000, 40_000, 60_000])
    expect(result[2]!.balance).toBeGreaterThan(60_000)
  })

  it('los meses sin aportación siguen capitalizando', () => {
    const months = monthRange('2026-01', '2026-12')
    const result = projectScenario([contribution('2026-01', 100_000)], 0.09, months)

    expect(result[5]!.contributed).toBe(100_000)
    expect(result[5]!.balance).toBeGreaterThan(result[4]!.balance)
  })

  it('devuelve saldo cero cuando no hay aportaciones', () => {
    const months = monthRange('2026-01', '2026-03')
    const result = projectScenario([], 0.09, months)

    expect(result.map((p) => p.balance)).toEqual([0, 0, 0])
  })

  it('proyecta el plan real de la cartera a 25 años sin desbordarse', () => {
    const months = monthRange('2026-07', '2051-07')
    const contributions = months.map((m, i) => contribution(m, i === 0 ? 200_000 : 20_000))
    const result = projectScenario(contributions, 0.09, months)

    expect(result).toHaveLength(301)
    expect(Number.isSafeInteger(result[300]!.balance)).toBe(true)
    // Cota de cordura: entre 200.000 € y 400.000 €.
    expect(result[300]!.balance).toBeGreaterThan(20_000_000)
    expect(result[300]!.balance).toBeLessThan(40_000_000)
  })

  it('ignora las aportaciones fuera del rango de meses proyectado', () => {
    const months = monthRange('2026-02', '2026-03')
    const result = projectScenario([contribution('2026-01', 100_000)], 0, months)

    expect(result.map((p) => p.balance)).toEqual([0, 0])
  })
})
```

- [ ] **Paso 2: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/scenarios.test.ts`
Esperado: FALLA por no resolverse `./scenarios`.

- [ ] **Paso 3: Crear `core/scenarios.ts`**

```ts
import Decimal from './decimal'
import { monthlyRate } from './rates'
import type { Cents, Contribution, Month } from './types'

export interface ScenarioPoint {
  month: Month
  /** Saldo proyectado al cierre del mes. */
  balance: Cents
  /** Total aportado hasta el cierre del mes, sin rendimiento. */
  contributed: Cents
}

/**
 * Proyecta la evolución de un escenario teórico mes a mes.
 *
 *   saldo(n) = (saldo(n-1) + aportaciones_inicio(n)) * (1 + r) + aportaciones_fin(n)
 *
 * El saldo se arrastra en `Decimal` a plena precisión durante todo el horizonte y
 * solo se redondea a céntimos al construir cada punto de salida. Redondear en cada
 * iteración acumularía error a lo largo de 300 meses.
 *
 * Las aportaciones cuyo mes cae fuera de `months` se ignoran.
 */
export function projectScenario(
  contributions: Contribution[],
  annualRate: number,
  months: Month[],
): ScenarioPoint[] {
  const rateFactor = monthlyRate(annualRate).plus(1)

  const startOfMonth = new Map<Month, Cents>()
  const endOfMonth = new Map<Month, Cents>()
  for (const c of contributions) {
    const bucket = c.timing === 'start' ? startOfMonth : endOfMonth
    bucket.set(c.month, (bucket.get(c.month) ?? 0) + c.amount)
  }

  let balance = new Decimal(0)
  let contributed = 0
  const points: ScenarioPoint[] = []

  for (const month of months) {
    const atStart = startOfMonth.get(month) ?? 0
    const atEnd = endOfMonth.get(month) ?? 0

    balance = balance.plus(atStart).times(rateFactor).plus(atEnd)
    contributed += atStart + atEnd

    points.push({
      month,
      balance: balance.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      contributed,
    })
  }

  return points
}
```

- [ ] **Paso 4: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/scenarios.test.ts`
Esperado: 8 tests en verde.

- [ ] **Paso 5: Commit**

```bash
git add core/scenarios.ts core/scenarios.test.ts
git commit -m "Proyección de escenarios teóricos

El saldo se arrastra en Decimal a plena precisión y solo se redondea al
construir cada punto de salida; redondear en cada iteración acumularía
error a lo largo de los 300 meses del horizonte."
```

---

## Tarea 6: Compra de participaciones

**Ficheros:**
- Crear: `core/purchases.ts`
- Crear: `core/purchases.test.ts`

**Interfaces:**
- Consume: `split` de `core/money.ts`, tipos de `core/types.ts`
- Produce:
  - `interface Purchase { fundId: string; date: IsoDate; amount: Cents; nav: string; units: string }`
  - `function buildPurchases(contribution: Contribution, date: IsoDate, navByFund: Record<string, string>): Purchase[]`

Las participaciones se redondean a **6 decimales, ROUND_HALF_UP**. Si el bróker ejecutó con otra
precisión, la compra se corrige a mano: la sección 4 del spec lo contempla.

- [ ] **Paso 1: Escribir el test que falla**

Crear `core/purchases.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildPurchases } from './purchases'
import type { Contribution } from './types'

const CONTRIBUTION: Contribution = {
  month: '2026-08',
  amount: 20_000,
  timing: 'start',
  weights: [
    { fundId: 'world', weight: 0.8 },
    { fundId: 'emerging', weight: 0.2 },
  ],
}

describe('buildPurchases', () => {
  it('reparte la aportación y convierte cada parte en participaciones', () => {
    const result = buildPurchases(CONTRIBUTION, '2026-08-03', { world: '10', emerging: '10' })

    expect(result).toEqual([
      { fundId: 'world', date: '2026-08-03', amount: 16_000, nav: '10', units: '16.000000' },
      { fundId: 'emerging', date: '2026-08-03', amount: 4_000, nav: '10', units: '4.000000' },
    ])
  })

  it('redondea las participaciones a seis decimales', () => {
    const single: Contribution = {
      ...CONTRIBUTION,
      amount: 10_000,
      weights: [{ fundId: 'world', weight: 1 }],
    }
    const result = buildPurchases(single, '2026-08-03', { world: '3' })

    // 100 € / 3 = 33,333333...
    expect(result[0]!.units).toBe('33.333333')
  })

  it('los importes de las compras suman la aportación exacta', () => {
    const odd: Contribution = { ...CONTRIBUTION, amount: 20_001 }
    const result = buildPurchases(odd, '2026-08-03', { world: '10', emerging: '10' })

    expect(result.reduce((sum, p) => sum + p.amount, 0)).toBe(20_001)
  })

  it('maneja valores liquidativos con muchos decimales', () => {
    const single: Contribution = {
      ...CONTRIBUTION,
      amount: 16_000,
      weights: [{ fundId: 'world', weight: 1 }],
    }
    const result = buildPurchases(single, '2026-08-03', { world: '14.8321' })

    // 160 / 14,8321 = 10,787414...
    expect(result[0]!.units).toBe('10.787414')
  })

  it('rechaza un fondo sin valor liquidativo disponible', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '10' }))
      .toThrow('No hay valor liquidativo para el fondo "emerging" en 2026-08-03')
  })

  it('rechaza un valor liquidativo de cero', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '0', emerging: '10' }))
      .toThrow('El valor liquidativo del fondo "world" debe ser positivo')
  })

  it('rechaza un valor liquidativo negativo', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '-1', emerging: '10' }))
      .toThrow('El valor liquidativo del fondo "world" debe ser positivo')
  })
})
```

- [ ] **Paso 2: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/purchases.test.ts`
Esperado: FALLA por no resolverse `./purchases`.

- [ ] **Paso 3: Crear `core/purchases.ts`**

```ts
import Decimal from './decimal'
import { split } from './money'
import type { Cents, Contribution, IsoDate } from './types'

/** Decimales con los que se registran las participaciones. */
const UNIT_DECIMALS = 6

export interface Purchase {
  fundId: string
  date: IsoDate
  amount: Cents
  /** Valor liquidativo aplicado, como cadena decimal. */
  nav: string
  /** Participaciones adquiridas, como cadena decimal con seis decimales. */
  units: string
}

/**
 * Convierte una aportación en las compras concretas que la materializan.
 *
 * El importe se reparte primero entre los fondos según los pesos, garantizando
 * que la suma cuadre al céntimo, y solo después se traduce cada parte a
 * participaciones dividiéndola por el valor liquidativo del día.
 *
 * Una compra materializada es un hecho histórico: se persiste y no se recalcula
 * aunque después cambie la regla de aportación.
 */
export function buildPurchases(
  contribution: Contribution,
  date: IsoDate,
  navByFund: Record<string, string>,
): Purchase[] {
  const amounts = split(contribution.amount, contribution.weights)

  return contribution.weights.map((weight) => {
    const nav = navByFund[weight.fundId]
    if (nav === undefined) {
      throw new Error(`No hay valor liquidativo para el fondo "${weight.fundId}" en ${date}`)
    }

    const navDecimal = new Decimal(nav)
    if (navDecimal.lessThanOrEqualTo(0)) {
      throw new Error(`El valor liquidativo del fondo "${weight.fundId}" debe ser positivo, recibido ${nav}`)
    }

    const amount = amounts[weight.fundId]!
    const units = new Decimal(amount)
      .div(100)
      .div(navDecimal)
      .toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_HALF_UP)

    return { fundId: weight.fundId, date, amount, nav, units: units.toFixed(UNIT_DECIMALS) }
  })
}
```

- [ ] **Paso 4: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/purchases.test.ts`
Esperado: 7 tests en verde.

- [ ] **Paso 5: Commit**

```bash
git add core/purchases.ts core/purchases.test.ts
git commit -m "Materialización de aportaciones en compras de participaciones

Reparte primero en céntimos (donde la suma tiene que cuadrar) y solo
después divide por el valor liquidativo. Al revés se perderían céntimos
en el redondeo."
```

---

## Tarea 7: Valoración de la cartera

**Ficheros:**
- Crear: `core/valuation.ts`
- Crear: `core/valuation.test.ts`

**Interfaces:**
- Consume: `Purchase` de `core/purchases.ts`, `Cents` de `core/types.ts`
- Produce:
  - `interface FundPosition { fundId: string; units: string; nav: string; value: Cents; invested: Cents; gain: Cents }`
  - `interface Valuation { value: Cents; invested: Cents; gain: Cents; gainRatio: number; byFund: FundPosition[] }`
  - `function valuate(purchases: Purchase[], navByFund: Record<string, string>): Valuation`

- [ ] **Paso 1: Escribir el test que falla**

Crear `core/valuation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { valuate } from './valuation'
import type { Purchase } from './purchases'

const PURCHASES: Purchase[] = [
  { fundId: 'world', date: '2026-08-03', amount: 16_000, nav: '10', units: '16.000000' },
  { fundId: 'emerging', date: '2026-08-03', amount: 4_000, nav: '10', units: '4.000000' },
]

describe('valuate', () => {
  it('valora cada posición al valor liquidativo actual', () => {
    const result = valuate(PURCHASES, { world: '11', emerging: '12' })

    // 16 × 11 = 176 € y 4 × 12 = 48 €
    expect(result.value).toBe(22_400)
    expect(result.invested).toBe(20_000)
    expect(result.gain).toBe(2_400)
    expect(result.gainRatio).toBeCloseTo(0.12, 10)
  })

  it('agrega varias compras del mismo fondo', () => {
    const purchases: Purchase[] = [
      ...PURCHASES,
      { fundId: 'world', date: '2026-09-01', amount: 16_000, nav: '16', units: '10.000000' },
    ]
    const result = valuate(purchases, { world: '20', emerging: '10' })

    const world = result.byFund.find((p) => p.fundId === 'world')!
    expect(world.units).toBe('26.000000')
    expect(world.invested).toBe(32_000)
    expect(world.value).toBe(52_000)
  })

  it('registra pérdidas con signo negativo', () => {
    const result = valuate(PURCHASES, { world: '8', emerging: '9' })

    // 16 × 8 = 128 € y 4 × 9 = 36 €
    expect(result.value).toBe(16_400)
    expect(result.gain).toBe(-3_600)
    expect(result.gainRatio).toBeCloseTo(-0.18, 10)
  })

  it('devuelve una valoración vacía sin compras', () => {
    const result = valuate([], {})

    expect(result).toEqual({ value: 0, invested: 0, gain: 0, gainRatio: 0, byFund: [] })
  })

  it('ordena las posiciones por valor descendente', () => {
    const result = valuate(PURCHASES, { world: '10', emerging: '10' })

    expect(result.byFund.map((p) => p.fundId)).toEqual(['world', 'emerging'])
  })

  it('rechaza un fondo sin valor liquidativo actual', () => {
    expect(() => valuate(PURCHASES, { world: '11' }))
      .toThrow('No hay valor liquidativo actual para el fondo "emerging"')
  })
})
```

- [ ] **Paso 2: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/valuation.test.ts`
Esperado: FALLA por no resolverse `./valuation`.

- [ ] **Paso 3: Crear `core/valuation.ts`**

```ts
import Decimal from './decimal'
import type { Purchase } from './purchases'
import type { Cents } from './types'

const UNIT_DECIMALS = 6

export interface FundPosition {
  fundId: string
  /** Participaciones acumuladas, como cadena decimal. */
  units: string
  /** Valor liquidativo aplicado en la valoración. */
  nav: string
  value: Cents
  invested: Cents
  gain: Cents
}

export interface Valuation {
  value: Cents
  invested: Cents
  gain: Cents
  /** Plusvalía en tanto por uno sobre lo invertido. Cero si no se ha invertido nada. */
  gainRatio: number
  byFund: FundPosition[]
}

/**
 * Valora una cartera a partir de sus compras y de los valores liquidativos actuales.
 *
 * Agrega las compras por fondo, suma participaciones y coste, y multiplica por el
 * valor liquidativo vigente. El redondeo a céntimos se hace una sola vez por fondo,
 * al final.
 */
export function valuate(purchases: Purchase[], navByFund: Record<string, string>): Valuation {
  const aggregated = new Map<string, { units: Decimal, invested: Cents }>()

  for (const purchase of purchases) {
    const current = aggregated.get(purchase.fundId) ?? { units: new Decimal(0), invested: 0 }
    aggregated.set(purchase.fundId, {
      units: current.units.plus(purchase.units),
      invested: current.invested + purchase.amount,
    })
  }

  const byFund: FundPosition[] = []
  for (const [fundId, position] of aggregated) {
    const nav = navByFund[fundId]
    if (nav === undefined) {
      throw new Error(`No hay valor liquidativo actual para el fondo "${fundId}"`)
    }

    const value = position.units
      .times(nav)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber()

    byFund.push({
      fundId,
      units: position.units.toFixed(UNIT_DECIMALS),
      nav,
      value,
      invested: position.invested,
      gain: value - position.invested,
    })
  }

  byFund.sort((a, b) => b.value - a.value)

  const value = byFund.reduce((sum, p) => sum + p.value, 0)
  const invested = byFund.reduce((sum, p) => sum + p.invested, 0)

  return {
    value,
    invested,
    gain: value - invested,
    gainRatio: invested === 0 ? 0 : (value - invested) / invested,
    byFund,
  }
}
```

- [ ] **Paso 4: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/valuation.test.ts`
Esperado: 6 tests en verde.

- [ ] **Paso 5: Commit**

```bash
git add core/valuation.ts core/valuation.test.ts
git commit -m "Valoración de la cartera por posición y agregada"
```

---

## Tarea 8: Rentabilidad real (XIRR)

**Ficheros:**
- Crear: `core/returns.ts`
- Crear: `core/returns.test.ts`

**Interfaces:**
- Consume: `Cents`, `IsoDate` de `core/types.ts`
- Produce:
  - `interface CashFlow { date: IsoDate; amount: Cents }`
  - `function xirr(flows: CashFlow[]): number`

Convenio de signos: las aportaciones son **negativas** (sale dinero del bolsillo) y el valor
actual de la cartera entra como flujo **positivo** en la fecha de valoración.

- [ ] **Paso 1: Escribir el test que falla**

Crear `core/returns.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xirr } from './returns'

describe('xirr', () => {
  it('un 10 % en exactamente un año da 0,10', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 110_000 },
    ])

    expect(result).toBeCloseTo(0.1, 6)
  })

  it('duplicar el capital en un año da 1,00', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 200_000 },
    ])

    expect(result).toBeCloseTo(1, 6)
  })

  it('una pérdida da rentabilidad negativa', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 90_000 },
    ])

    expect(result).toBeCloseTo(-0.1, 6)
  })

  it('recuperar lo aportado da 0 %', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 100_000 },
    ])

    expect(result).toBeCloseTo(0, 6)
  })

  it('pondera por tiempo cada aportación', () => {
    // Dos aportaciones iguales, la segunda a mitad de año. Con 210.000 € al
    // final, la rentabilidad supera el 5 % nominal porque la mitad del capital
    // estuvo invertida solo seis meses.
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2021-07-01', amount: -100_000 },
      { date: '2022-01-01', amount: 210_000 },
    ])

    expect(result).toBeGreaterThan(0.05)
    expect(result).toBeLessThan(0.20)
  })

  it('no depende del orden de los flujos', () => {
    const ordered = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 110_000 },
    ])
    const shuffled = xirr([
      { date: '2022-01-01', amount: 110_000 },
      { date: '2021-01-01', amount: -100_000 },
    ])

    expect(shuffled).toBeCloseTo(ordered, 12)
  })

  it('rechaza menos de dos flujos', () => {
    expect(() => xirr([{ date: '2021-01-01', amount: -100_000 }]))
      .toThrow('El cálculo de XIRR necesita al menos dos flujos')
  })

  it('rechaza flujos de un solo signo', () => {
    expect(() => xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: -100_000 },
    ])).toThrow('El cálculo de XIRR necesita flujos positivos y negativos')
  })
})
```

- [ ] **Paso 2: Ejecutar y verlo fallar**

Ejecuta: `pnpm test core/returns.test.ts`
Esperado: FALLA por no resolverse `./returns`.

- [ ] **Paso 3: Crear `core/returns.ts`**

```ts
import type { Cents, IsoDate } from './types'

const DAYS_PER_YEAR = 365
const MS_PER_DAY = 86_400_000
const TOLERANCE = 1e-9

export interface CashFlow {
  date: IsoDate
  /** Negativo cuando sale dinero (aportación), positivo cuando entra. */
  amount: Cents
}

/**
 * Tasa interna de retorno de flujos con fechas irregulares.
 *
 * Resuelve `Σ importe_i / (1 + r)^(años_i) = 0` con Newton-Raphson y, si no
 * converge, con bisección. Newton es rápido pero puede dispararse si la
 * derivada se acerca a cero; la bisección siempre converge cuando hay cambio
 * de signo, que está garantizado porque exigimos flujos de ambos signos.
 *
 * Se usa `number` y no `Decimal`: es un método iterativo cuya precisión la
 * marca la tolerancia de convergencia, no la aritmética. Devuelve una tasa,
 * no un importe, así que no hay céntimos que perder.
 */
export function xirr(flows: CashFlow[]): number {
  if (flows.length < 2) {
    throw new Error('El cálculo de XIRR necesita al menos dos flujos')
  }
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) {
    throw new Error('El cálculo de XIRR necesita flujos positivos y negativos')
  }

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const origin = Date.parse(sorted[0]!.date)
  const years = sorted.map((f) => (Date.parse(f.date) - origin) / (DAYS_PER_YEAR * MS_PER_DAY))
  const amounts = sorted.map((f) => f.amount / 100)

  const npv = (rate: number): number =>
    amounts.reduce((sum, amount, i) => sum + amount / (1 + rate) ** years[i]!, 0)

  const derivative = (rate: number): number =>
    amounts.reduce((sum, amount, i) => sum - (years[i]! * amount) / (1 + rate) ** (years[i]! + 1), 0)

  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const value = npv(rate)
    if (Math.abs(value) < TOLERANCE) return rate

    const slope = derivative(rate)
    if (slope === 0) break

    const next = rate - value / slope
    if (!Number.isFinite(next) || next <= -1) break
    if (Math.abs(next - rate) < 1e-12) return next
    rate = next
  }

  // Respaldo por bisección sobre un rango amplio pero acotado.
  let low = -0.999_999
  let high = 10
  let valueLow = npv(low)
  if (valueLow * npv(high) > 0) {
    throw new Error('El cálculo de XIRR no converge en el rango [-99,99 %, 1000 %]')
  }

  for (let i = 0; i < 300; i++) {
    const middle = (low + high) / 2
    const valueMiddle = npv(middle)
    if (Math.abs(valueMiddle) < TOLERANCE) return middle

    if (valueLow * valueMiddle < 0) {
      high = middle
    } else {
      low = middle
      valueLow = valueMiddle
    }
  }

  return (low + high) / 2
}
```

- [ ] **Paso 4: Ejecutar y verlo pasar**

Ejecuta: `pnpm test core/returns.test.ts`
Esperado: 8 tests en verde.

- [ ] **Paso 5: Ejecutar la suite completa**

Ejecuta: `pnpm test`
Esperado: los 67 tests de `core/` en verde (2 de humo, 9 de reparto, 6 de tasas,
9 de meses, 12 de aportaciones, 8 de escenarios, 7 de compras, 6 de valoración, 8 de XIRR).

- [ ] **Paso 6: Commit**

```bash
git add core/returns.ts core/returns.test.ts
git commit -m "Rentabilidad real por XIRR

Newton-Raphson con respaldo por bisección: Newton converge rápido pero se
dispara cuando la derivada se acerca a cero, y la bisección siempre llega
si hay cambio de signo."
```

---

## Verificación de cierre

Al terminar las ocho tareas debe cumplirse:

- [ ] `pnpm test` termina en verde
- [ ] `pnpm exec nuxt prepare` termina sin error
- [ ] `grep -rE "from '(nuxt|drizzle|h3|ofetch)" core/` no devuelve nada — `core/` sigue puro
- [ ] `grep -rn "/ 12" core/` solo aparece en `rates.ts` dentro de `pow(1/12)`, nunca como `rate / 12`
- [ ] `grep -rn "parseFloat" core/` no devuelve nada

## Qué queda fuera de este plan

| Pendiente | Plan |
|---|---|
| Esquema Drizzle, migraciones y repositorios | 2 |
| `PriceProvider`, `YahooProvider` y sincronización idempotente | 2 |
| Rutas Nitro | 2 |
| shadcn-vue, las cuatro pantallas y `<EvolutionChart>` | 3 |
| Tests de componente con `@vue/test-utils` | 3 |
| Datos iniciales de la cartera real | 3 |
