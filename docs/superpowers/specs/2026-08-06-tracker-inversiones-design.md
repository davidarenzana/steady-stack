# Tracker de inversiones indexadas — Diseño

**Fecha:** 2026-08-06
**Estado:** aprobado, pendiente de plan de implementación

---

## 1. Objetivo

Sustituir una hoja de cálculo por una aplicación local que lleve el seguimiento de una cartera
indexada de aportaciones periódicas: cuánto se ha aportado, cuánto vale hoy, qué rentabilidad
real se lleva, y cómo se compara con escenarios teóricos de rentabilidad a largo plazo.

El problema concreto que resuelve: en la hoja de referencia, el valor de la cartera se teclea a
mano sumando el valor de cada fondo consultado en investing.com. Ese trabajo manual hizo que los
datos reales se abandonaran a los seis meses. La aplicación descarga los valores liquidativos
automáticamente.

## 2. Alcance

### Dentro de la v1

- Una cartera con dos fondos indexados
- Aportación periódica definida por regla, con excepciones puntuales (meses saltados, extras)
- Registro de participaciones compradas a valor liquidativo real
- Descarga automática de valores liquidativos por ISIN
- Valoración actual, plusvalía y rentabilidad real (XIRR)
- Escenarios teóricos configurables y su proyección
- Gráfico de evolución: cartera real y escenarios sobre el mismo eje

### Fuera de la v1

| Descartado | Motivo |
|---|---|
| Usuarios y autenticación | Uso personal en local. Se replanteará en v2 |
| Varias carteras en la interfaz | Solo la cartera indexada de momento. El esquema ya lo soporta |
| Comparativa contra índice (base 100) | Aplazado a v2 por decisión explícita |
| Importación de extractos del bróker | Requiere un parser por bróker; el alta manual basta |
| Despliegue | Se decidirá más adelante. El diseño no lo bloquea |

## 3. Stack

| Capa | Elección | Versión verificada |
|---|---|---|
| Runtime | Node | 22.14.0 |
| Gestor de paquetes | pnpm | 11.8.0 |
| Framework | Nuxt (Vue 3, SSR + Nitro) | 4.5.2 / 3.5.41 |
| Lenguaje | TypeScript | — |
| ORM | Drizzle | 0.45.2 |
| Base de datos | SQLite, fichero `data/stonks.db` | better-sqlite3 13.0.3 |
| Componentes | shadcn-vue (sobre reka-ui) | 2.8.1 / 2.10.1 |
| Gráficos | Unovis | @unovis/vue 1.6.7 |
| Decimales | decimal.js | — |
| Tests | Vitest + @vue/test-utils + happy-dom | — |

**Por qué Nuxt y no Vue + Vite.** La API de Yahoo Finance responde sin cabecera
`Access-Control-Allow-Origin` (comprobado). Un cliente en el navegador no puede llamarla: hace
falta servidor. Nitro aporta ese proxy, las rutas `/api/*` y el renderizado en un solo proyecto,
un solo proceso y un solo despliegue.

**Por qué SQLite.** Cero infraestructura: `pnpm dev` y funciona. Drizzle abstrae el motor, así
que migrar a Postgres el día del despliegue es cambiar driver y cadena de conexión.

**Por qué Unovis.** Los componentes `Chart` de shadcn-vue están construidos sobre Unovis, así que
heredan las variables CSS del tema sin trabajo extra. Añadir otra librería supondría mantener dos
sistemas de estilo. Irá envuelto en un componente propio `<EvolutionChart>` para que sustituirlo
sea tocar un fichero.

## 4. Modelo de datos

```
portfolio               id, nombre, divisa
fund                    id, isin, nombre, símbolo_proveedor, divisa
contribution_rule       portfolio_id, desde_mes, importe, pesos[], momento
contribution_override   portfolio_id, mes, importe|null, momento, nota
purchase                portfolio_id, fund_id, fecha, importe, vl, participaciones, origen
nav                     fund_id, fecha, valor, origen        -- única por (fund_id, fecha)
scenario                id, nombre, tasa_anual, color
```

### Aportaciones: regla más excepciones

La aportación periódica se define una vez (`200 €/mes, 80/20, desde ago-2026`) y la aplicación
genera los meses. Una `contribution_override` cubre lo que se sale de la norma: un mes saltado
(`importe = null`), una aportación extra, o un importe distinto.

Cambiar la regla no reescribe el pasado: una regla nueva se añade con su propio `desde_mes` y la
anterior sigue rigiendo los meses previos.

### Compras: materialización

Las aportaciones son **derivadas** — se calculan, no se guardan. Una compra ejecutada es un
**hecho histórico**: se compraron 107,8641 participaciones a 14,8321 €, y eso no cambia aunque
mañana se edite la regla.

Por eso hay un paso de materialización: cuando el mes llega y el valor liquidativo está
disponible, la aportación planificada se convierte en filas `purchase` con VL y participaciones
reales, y ahí quedan congeladas. Editables a mano si el bróker ejecutó a otro precio.

### Momento de la aportación

Cada aportación lleva un campo `momento` con valores `inicio` (por defecto) o `fin`. Determina si
devenga rendimiento en su mes de llegada dentro de los escenarios. Solo afecta a la proyección
teórica: las compras reales usan la fecha y el VL efectivos.

## 5. Motor de cálculo

`core/` no importa nada de Nuxt, Drizzle ni red. Son funciones puras, y ahí vive la mayoría de
los tests.

```
core/
  contributions.ts   reglas + excepciones          -> aportaciones mensuales
  purchases.ts       aportación + VL               -> participaciones
  valuation.ts       participaciones + VL          -> valor, plusvalía, coste medio
  returns.ts         flujos de caja                -> XIRR, TWR
  scenarios.ts       aportaciones + tasa           -> serie proyectada
```

### Convención de capitalización

La tasa mensual se deriva de la anual con **`(1 + r)^(1/12) - 1`**, no con `r / 12`.

El atajo `r / 12` no produce la rentabilidad anual declarada. A un 9 % nominal, `0,75 %` mensual
compuesto doce veces da `1.093,81 €` sobre `1.000 €`, es decir un 9,381 % real. La tasa correcta
es `0,7207 %`, que da exactamente `1.090,00 €`. Es la distinción entre TIN y TAE.

El error es sistemático y se compone durante todo el horizonte. Sobre el plan real de esta
cartera, a 25 años y al 9 %, el atajo sobreestima el resultado en **14.415 €** (+6,26 %).

La hoja de referencia usa `r / 12`. Se descarta conscientemente: el usuario pidió mejorar los
cálculos donde procediera.

### Fórmula de proyección

```
saldo(n) = (saldo(n-1) + aportaciones_inicio(n)) * (1 + r_mensual) + aportaciones_fin(n)
```

## 6. Proveedores de precio

```
interface PriceProvider {
  resolve(isin: string): Promise<SymbolCandidate[]>
  history(symbol: string, from: Date, to: Date): Promise<Nav[]>
}
```

| Implementación | Papel |
|---|---|
| `YahooProvider` | Por defecto. Verificado con ambos ISIN de la cartera |
| `ManualEntry` | Override. Un VL introducido a mano siempre prevalece |

**Verificación realizada.** El flujo `search?q=<ISIN>` → símbolo → `chart?range=…` devuelve series
diarias en euros para los dos fondos:

| Fondo | ISIN | Símbolo | Comprobado |
|---|---|---|---|
| Fidelity MSCI World Index | `IE00BYX5NX33` | `0P0001CLDK.F` / `IE00BYX5NX33.SG` | 507 VL diarios en EUR |
| Vanguard Emerging Markets | `IE0031786696` | `0P00012I6A.F` | 507 VL diarios en EUR |

**Clases de participación.** Un mismo ISIN devuelve varios símbolos con precios distintos
(`0P0001CLDK.F` a 9,99 € frente a `IE00BYX5NX33.SG` a 14,33 €). El alta de un fondo muestra los
candidatos con su precio actual para que el usuario elija el que coincide con su extracto. No se
adivina.

**Riesgo asumido.** La API de Yahoo no es oficial y puede romperse sin aviso. Mitigación: los VL
descargados se persisten en la base de datos local, así que el histórico ya obtenido no se pierde,
y la entrada manual permite seguir operando. La interfaz `PriceProvider` permite añadir otro
proveedor sin tocar el resto del sistema.

**Alpha Vantage, evaluado y descartado como proveedor inicial.** El límite gratuito de 25
peticiones diarias es suficiente para esta escala. El problema es la cobertura: su universo son
tickers cotizados, y estos dos productos son fondos no cotizados que publican VL. Su documentación
no menciona ni ISIN ni UCITS, y sin clave no se pudo verificar. Queda como segunda implementación
si en algún momento se comprueba que cubre estos fondos.

**Retraso de publicación.** Los VL se publican con aproximadamente un día de desfase; los últimos
días de la serie llegan como `null`. La aplicación valora con el último VL disponible y muestra en
pantalla a qué fecha corresponde.

## 7. Precisión numérica

Nada de coma flotante para dinero.

| Magnitud | Representación |
|---|---|
| Importes | Enteros en céntimos |
| Valores liquidativos | Cadena decimal, aritmética con `decimal.js` |
| Participaciones | Cadena decimal, seis o más decimales |

Evita que 200 € repartidos 80/20 acaben en 159,99999 €, y mapea limpio a `NUMERIC` de Postgres.

## 8. Pantallas

1. **Dashboard** — valor actual, aportado, plusvalía en euros y porcentaje, XIRR, y el gráfico de
   evolución superponiendo cartera real y escenarios
2. **Aportaciones** — reglas vigentes, excepciones, tabla mensual
3. **Fondos** — alta por ISIN con selección de símbolo, pesos, VL actual, botón de refresco
4. **Escenarios** — tasas y horizonte configurables

## 9. Actualización de valores liquidativos

Botón en la interfaz y script `pnpm sync:nav`. Sin planificador en local. La ruta
`/api/nav/sync` pide únicamente los días que falten y hace *upsert*: es idempotente y se puede
invocar cuantas veces se quiera.

## 10. Estructura del proyecto

```
core/           motor de cálculo, funciones puras, sin E/S
server/
  api/          rutas Nitro
  providers/    yahoo.ts, manual.ts
  db/           esquema Drizzle y migraciones
app/            páginas y componentes Vue
```

## 11. Estrategia de test

Vitest en las cuatro capas. El grueso de la cobertura vive en `core/`, que se prueba llamando
funciones sin levantar nada.

### `core/` — motor de cálculo

Donde está el riesgo real: un céntimo mal redondeado se compone durante 300 meses de proyección.

- **Capitalización**: `(1+0,09)^(1/12)-1` aplicado doce veces sobre 1.000 € da 1.090,00 € exactos
- **Expansión de aportaciones**: una regla más un mes saltado más un extra produce la serie correcta
- **Cambio de regla**: subir la aportación no altera los meses anteriores
- **Participaciones**: importe dividido entre VL, con el redondeo esperado
- **Reparto**: 200 € al 80/20 dan 160 € y 40 €, y suman exactamente 200 €
- **Momento de la aportación**: `inicio` devenga el mes de llegada, `fin` no
- **XIRR**: contra un caso de flujos conocido

### Proveedores de precio

Contra respuestas grabadas, nunca contra la red. Un test que llama a Yahoo se pone rojo cuando
no hay conexión, y eso no informa sobre el código propio.

- **Resolución de ISIN**: una respuesta con varios candidatos los devuelve todos, sin elegir
- **Huecos en la serie**: los `null` de los últimos días no rompen la valoración
- **Override manual**: un VL introducido a mano prevalece sobre el del proveedor

### Capa de datos

Integración contra un fichero SQLite temporal.

- **Idempotencia de la sincronización**: dos ejecuciones seguidas no duplican filas `nav`
- **Materialización**: una compra ya ejecutada no cambia al editar la regla

### Interfaz

Componentes con `@vue/test-utils` sobre `happy-dom`. Sin navegador: se comprueba que, dado un
estado, el componente renderiza lo correcto.

- **Formato**: aportado 2.200 € y valor 2.431,50 € se muestran como `+231,50 €` y `+10,52 %`
- **Series del gráfico**: `<EvolutionChart>` recibe la cartera real y los escenarios activos
- **Estado vacío**: sin aportaciones registradas no se renderiza un gráfico en blanco ni un NaN
- **Fecha de valoración**: se muestra a qué día corresponde el último VL disponible

Los tests de extremo a extremo con navegador quedan fuera de la v1.

## 12. Método de implementación

**SDD + TDD.** El plan se descompone en tareas acotadas; cada una la ejecuta un subagente
`implementer` y la contrasta un subagente `reviewer` antes de darla por cerrada.

Dentro de cada tarea, el ciclo es rojo → verde:

1. Escribir el test que describe el comportamiento
2. Ejecutarlo y **verlo fallar**. Un test que pasa antes de existir el código no prueba nada
3. Escribir el mínimo código que lo pone en verde
4. Volver a ejecutarlo y confirmar

Ninguna tarea se declara terminada sin la salida real del comando de verificación.

Agentes definidos en `.claude/agents/`:

| Agente | Modelo | Papel |
|---|---|---|
| `planner` | opus | Descompone el spec en fases y tareas verificables |
| `implementer` | sonnet | Ejecuta una tarea siguiendo TDD |
| `reviewer` | sonnet | Contrasta contra el spec; no modifica código |

Los commits los lleva el agente principal, que es quien conoce la intención del cambio.

## 13. Datos iniciales

```
Cartera: indexada, EUR

Fondos
  80 %   Fidelity MSCI World Index Fund EUR P Acc              IE00BYX5NX33
  20 %   Vanguard Emerging Markets Stock Index Fund Inv EUR Acc IE0031786696

Aportaciones
  jul-2026   2.000 €   inicial, 80/20  ->  1.600 € / 400 €
  ago-2026     200 €   regla recurrente mensual, 80/20  ->  160 € / 40 €
             + extras puntuales según vayan surgiendo

Escenarios
  Sin interés    0 %
  Escenario 1    5 %
  Escenario 2    9 %
  Horizonte      25 años (configurable)
```

## 14. Notas sobre la hoja de referencia

La hoja de cálculo que originó el proyecto pertenece a un tercero y sirvió de referencia, no de
especificación. Dos cosas se tomaron de ella y una se descartó:

- **Se toma** la estructura de comparar aportación acumulada, cartera real y escenarios en un mismo
  gráfico
- **Se toma** el modelo de participaciones, que su hoja «Cartera del canal» ya empleaba
  (ISIN, fecha de compra, precio, participaciones, valor actual)
- **Se descarta** la convención `r / 12`, por lo explicado en la sección 5

## 15. Aplazado a v2

- Usuarios y autenticación
- Varias carteras en la interfaz
- Comparativa contra índice en base 100
- Importación de extractos del bróker
- Despliegue y migración a Postgres
