# Phase 1 — Route tests

**Goal:** all 26 Nitro routes covered by an automated suite that runs a real Nuxt server against a
throwaway database. When this phase closes, `pnpm test --project routes` is the thing that proves the
route contract of plan 2, and no screen is built on a promise.

**Prerequisite:** none. This phase starts from `main` with plan 2 closed (362 tests passing).

**Verification of the whole phase:** `pnpm test --project routes` green, covering every one of the 26
routes tabulated in plan 2's *Two decisions, and why* section.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [ ] Task 1.1 — The database file and the migrations folder come from the environment
- [ ] Task 1.2 — The route-test harness and a smoke test
- [ ] Task 1.3 — Portfolio and dashboard routes (1, 2, 3)
- [ ] Task 1.4 — Funds routes (4, 5, 6, 7, 8)
- [ ] Task 1.5 — `PATCH /api/funds/:id` can clear `providerSymbol` back to `null`
- [ ] Task 1.6 — NAV routes (9, 10, 11)
- [ ] Task 1.7 — Contribution routes (12, 13, 14, 15, 16, 17)
- [ ] Task 1.8 — Purchase routes (18, 19, 20, 21, 22)
- [ ] Task 1.9 — Scenario routes (23, 24, 25, 26)

---

## Context an implementer needs

**The route surface is `docs/superpowers/plans/2026-08-07-persistencia-y-red.md`, section *Two
decisions, and why*.** It lists all 26 routes with method, path, request and response shape. Read the
table before writing a test; do not infer a shape from a handler.

**The seeded database.** `seedInitialData(db)` in `server/db/seed.ts` inserts exactly this, and every
route test below assumes it:

| Thing | Value |
|---|---|
| Portfolio | `id: 'index'`, `name: 'Cartera indexada'`, `currency: 'EUR'`, `horizonYears: 25` |
| Fund `world` | ISIN `IE00BYX5NX33`, `providerSymbol: null`, EUR |
| Fund `emerging` | ISIN `IE0031786696`, `providerSymbol: null`, EUR |
| Rule 1 | `fromMonth: '2026-07'`, `amount: 200000` (2.000 €), `timing: 'start'`, 80/20 world/emerging |
| Rule 2 | `fromMonth: '2026-08'`, `amount: 20000` (200 €), `timing: 'start'`, 80/20 |
| Scenarios | `flat` 0 % `chart-3`, `moderate` `'0.05'` `chart-2`, `optimistic` `'0.09'` `chart-1`, all enabled |
| NAVs | none |
| Purchases | none |

**Two routes reach the network and must not.** `GET /api/funds/resolve` and `POST /api/nav/sync` call
Yahoo. They are covered only on the paths that never get that far: a missing `isin` (a 400 raised by
validation before the provider is constructed), and a sync of funds that have no `providerSymbol`
(both seeded funds qualify, and the service reports `status: 'skipped'`, `reason: 'no-symbol'`
without a request). **Never send a real ISIN to `/api/funds/resolve` in a test, and never call
`/api/nav/sync` in a file that has set a `providerSymbol` on any fund.** The happy paths of both are
already covered against recorded fixtures in `server/providers/yahoo.test.ts`.

**On TDD in this phase.** These are characterisation tests over code that already works, so the
red step cannot come from a missing implementation. It is honoured instead as follows: in each of
tasks 1.3 to 1.9, before reporting the task done, pick one assertion in the new file, change its
expected value to something wrong, run the file, **paste the failing output into the report**, then
restore it and run again green. A file that has never been seen to fail proves nothing about the
server it claims to test. Task 1.5 is a genuine red → green: the behaviour it tests does not exist
yet.

**Cost.** `@nuxt/test-utils`' `setup()` runs a full `nuxt build` and starts the built server as a
subprocess, once per test file. A production build takes about 14 seconds on the reference machine,
so the six route files cost roughly two minutes in total, run sequentially. That is why task 1.2 adds
`pnpm test:fast`, which skips this project, for the inner loop.

---

## Task 1.1 — The database file and the migrations folder come from the environment

**Depends on:** nothing.

**Files:** `server/utils/database.ts` (edit), `server/db/client.ts` (edit),
`server/utils/database.test.ts` (new), `server/db/client.test.ts` (edit).

**Behaviour.** `server/utils/database.ts` gains an exported helper and uses it:

```ts
/** Where the running server keeps its database. `STEADY_STACK_DATABASE_FILE` wins; relative paths resolve against the working directory. */
export function resolveDatabaseFile(env: NodeJS.ProcessEnv = process.env): string
```

- With `STEADY_STACK_DATABASE_FILE` set to an absolute path, it returns that path unchanged.
- With it set to a relative path, it returns `resolve(process.cwd(), value)`.
- With it unset or an empty string, it returns `resolve(process.cwd(), 'data/steady-stack.db')` —
  the same file as today, now absolute, which is what closes the `cwd` trap recorded in `TODO.md`
  where a server started outside the project root silently created a stray empty database.

`useDatabase()` calls `resolveDatabaseFile()` instead of the `DATABASE_FILE` constant. Its lazy
singleton behaviour is unchanged.

In `server/db/client.ts`, `resolveMigrationsFolder()` gains a first branch: if
`process.env.STEADY_STACK_MIGRATIONS_DIR` is set and non-empty, return it (resolved absolute).
The existing `import.meta.url` strategy and the `process.cwd()` fallback stay, in that order, with
their comments intact.

**Tests.** In `server/utils/database.test.ts` (project `server`), four `it` blocks over
`resolveDatabaseFile`, each passing an explicit fake env object rather than mutating
`process.env`: absolute path returned as-is; relative path resolved against `process.cwd()`; unset
falls back to `<cwd>/data/steady-stack.db`; empty string treated as unset. In
`server/db/client.test.ts`, add one `it` asserting that `MIGRATIONS_FOLDER` ends with
`server/db/migrations` and that `meta/_journal.json` exists inside it. Do **not** test the env
branch by mutating `process.env` in a shared process; instead export a testable
`resolveMigrationsFolder(env)` taking the env as a parameter, defaulting to `process.env`, and test
that.

**Do not** call `useDatabase()` in any test: it would open a real file.

**Verify:** `pnpm test --project server server/utils/database.test.ts server/db/client.test.ts`

---

## Task 1.2 — The route-test harness and a smoke test

**Depends on:** 1.1.

**Files:** `server/test-utils/route-server.ts` (new), `vitest.config.ts` (edit), `package.json`
(edit), `test/routes/portfolio.test.ts` (new, smoke portion only — the rest lands in 1.3).

**Behaviour.** `server/test-utils/route-server.ts` exports:

```ts
/**
 * Boots a real Nuxt server for one test file, pointed at a throwaway SQLite
 * file under `os.tmpdir()`, and returns the handle to that database so a
 * test can arrange rows directly instead of through HTTP.
 */
export async function setupRouteServer(options?: { seed?: boolean }): Promise<TempDatabase>
```

It must, in this order:

1. `const temp = createTempDatabase()` from `./temp-db` — already migrated, already guarded against
   being created outside the system temp directory.
2. `seedInitialData(temp.db)` from `../db/seed`, unless `options.seed === false`.
3. Register `afterAll(() => temp.close())` **before** calling `setup()`. Vitest runs `afterAll`
   hooks last-registered-first, so registering ours first means the database is closed and deleted
   *after* `@nuxt/test-utils` has stopped the server.
4. `await setup({ ... })` from `@nuxt/test-utils/e2e` with exactly these options:

```ts
await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: true,
  build: true,
  nuxtConfig: { compatibilityDate: '2026-08-06' },
  env: {
    STEADY_STACK_DATABASE_FILE: temp.path,
    STEADY_STACK_MIGRATIONS_DIR: MIGRATIONS_FOLDER,
  },
})
```

`compatibilityDate` is passed explicitly because `@nuxt/test-utils` defaults it to `2024-04-03` and
that default *overrides* `nuxt.config.ts`. `MIGRATIONS_FOLDER` is imported from `../db/client`,
where Vitest resolves it correctly from `import.meta.url`; the server subprocess would otherwise have
to guess it from its own working directory.

5. `return temp`.

**`vitest.config.ts`** gains a fourth project, placed after `server`:

```ts
{
  // Route tests. Each file boots a real Nuxt server through @nuxt/test-utils,
  // which is the only way `h3` resolves — the same constraint that confined
  // Nitro auto-imports to `server/api/**` throughout plan 2. `singleFork`
  // keeps six Nuxt builds from running at once.
  resolve: {
    alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    name: 'routes',
    include: ['test/routes/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
}
```

**`package.json`** gains two scripts, and `test` keeps meaning *everything*:

```json
"test:fast": "vitest run --project core --project server --project app",
"test:routes": "vitest run --project routes"
```

**The smoke test**, `test/routes/portfolio.test.ts`, for now containing only:

- `const database = await setupRouteServer()` at the top level of the file, then `describe`s.
- `it('serves the seeded portfolio')`: `await $fetch('/api/portfolio')` equals
  `{ id: 'index', name: 'Cartera indexada', currency: 'EUR', horizonYears: 25, firstMonth: '2026-07' }`.
- `it('writes land in the temporary database, not in data/steady-stack.db')`: `POST /api/funds` with
  `{ id: 'probe', isin: 'IE00PROBE001', name: 'Sonda', currency: 'EUR' }`, then read the row back
  **through `database.db`** with `getFund(database.db, 'probe')` and assert it exists. The real
  database is deliberately not opened to check the negative: opening it would create WAL sidecar
  files next to it, which is itself the thing the rule forbids. What this asserts is that the server
  subprocess honoured `STEADY_STACK_DATABASE_FILE`; if it had not, the row would be missing here.

`$fetch` and `fetch` are imported from `@nuxt/test-utils/e2e`. `$fetch` throws on a non-2xx status,
so **status-code assertions use `fetch`**, which returns a `Response`: `const response = await
fetch('/api/funds/nope', { method: 'DELETE' })`, then `expect(response.status).toBe(404)`.

**Verify:** `pnpm test --project routes` — 2 tests passing, and the run must print no
`data/steady-stack.db` access. Then `pnpm test:fast` to confirm the other three projects still pass
(362 tests) and take under two seconds.

---

## Task 1.3 — Portfolio and dashboard routes (1, 2, 3)

**Depends on:** 1.2.

**File:** `test/routes/portfolio.test.ts` (extend the file from 1.2).

**Tests.** Against the seeded database, `asOf` always given explicitly so nothing depends on the day
the suite runs:

1. `GET /api/portfolio` — covered in 1.2.
2. `PATCH /api/portfolio` with `{ horizonYears: 30 }` returns `horizonYears: 30` and leaves `name`
   as `'Cartera indexada'`; a follow-up `GET` shows 30. Then `PATCH { horizonYears: 25 }` restores
   it, so the dashboard test below is not order-dependent.
3. `PATCH /api/portfolio` with `{ horizonYears: 0 }` → 400. With `{ horizonYears: 1.5 }` → 400.
4. `GET /api/dashboard?asOf=2026-08-06` on the seeded database returns:
   - `asOf: '2026-08-06'`, `navDate: null`, `xirr: null`
   - `valuation` deep-equals `{ value: 0, invested: 0, gain: 0, gainRatio: 0, byFund: [] }`
   - `series.months` has length `301`, `months[0] === '2026-07'`, `months[300] === '2051-07'`
   - `series.contributed[0] === 200000` and `series.contributed[1] === 220000`
   - `series.portfolio` has length 301 and every entry is `null`
   - `series.scenarios` has length 3, ids `['flat', 'moderate', 'optimistic']` in the order
     `listScenarios` returns them, each carrying `balance` of length 301, and `optimistic` carries
     `color: 'chart-1'` and `annualRate: '0.09'`
5. `GET /api/dashboard?asOf=not-a-date` → 400.
6. `GET /api/dashboard` with no query is a 200 (it defaults to today) and its `asOf` matches
   `/^\d{4}-\d{2}-\d{2}$/`. Do not assert the value: that would read the clock.

**Verify:** `pnpm test --project routes test/routes/portfolio.test.ts`

---

## Task 1.4 — Funds routes (4, 5, 6, 7, 8)

**Depends on:** 1.2.

**File:** `test/routes/funds.test.ts` (new).

**This file must never call `/api/nav/sync`.** It sets a `providerSymbol`, and a sync afterwards
would open a socket to Yahoo.

**Tests.**

1. `GET /api/funds` on the seeded database returns two entries. The `world` entry deep-equals
   `{ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World Index Fund EUR P Acc',
   providerSymbol: null, currency: 'EUR', latestNav: null, units: '0.000000', invested: 0, value: 0 }`.
2. `POST /api/funds` with `{ id: 'small', isin: 'IE00SMALL001', name: 'Small caps', currency: 'EUR' }`
   → status 201, body carries `id: 'small'` and `providerSymbol: null`.
3. `POST /api/funds` repeating `id: 'small'` → 409. Repeating the ISIN under a different id → 409.
4. `POST /api/funds` with `{ id: '' , ... }` → 400; with no `isin` → 400.
5. `PATCH /api/funds/small` with `{ name: 'Small caps renombrado' }` returns the new name and leaves
   `isin` untouched.
6. `PATCH /api/funds/does-not-exist` → 404.
7. `DELETE /api/funds/small` → 204, and a following `GET /api/funds` no longer lists it.
8. `DELETE /api/funds/does-not-exist` → 404.
9. **409 on deleting a fund with purchases**: insert a purchase for `world` directly through
   `database.db` with `insertPurchase(database.db, { fundId: 'world', month: '2026-07', date:
   '2026-07-01', amount: 160000, nav: '10', units: '160.000000', source: 'manual' })`, then
   `DELETE /api/funds/world` → 409. Clean it up afterwards with `deletePurchase` so the rest of the
   file is unaffected, or place this `it` last in the file.
10. `GET /api/funds/resolve` with no `isin` query → 400. **No test in this file sends a real ISIN.**

**Verify:** `pnpm test --project routes test/routes/funds.test.ts`

---

## Task 1.5 — `PATCH /api/funds/:id` can clear `providerSymbol` back to `null`

**Depends on:** 1.4. **This is the one genuine red → green task of the phase.**

**Files:** `server/utils/validation.ts` (edit), `server/utils/validation.test.ts` (edit),
`server/api/funds/[id].patch.ts` (edit), `test/routes/funds.test.ts` (extend).

**Why.** `readOptionalString` returns `undefined` for both an absent field and an explicit `null`, so
`{ providerSymbol: null }` reads as "leave it alone". The funds screen of phase 6 needs to undo a
wrong share-class choice, and today it cannot. Recorded in `TODO.md` under *Findings this plan leaves
for plan 3*.

**Behaviour.** Add to `server/utils/validation.ts`:

```ts
/**
 * Reads an optional string field that can also be cleared. `undefined` when
 * the field is absent — leave the stored value alone — and `null` when it is
 * explicitly `null`, which means set the column to `NULL`. The distinction
 * `readOptionalString` collapses, and the only way a wrong `providerSymbol`
 * can be undone.
 */
export function readClearableString(body: unknown, field: string): string | null | undefined
```

Rules: field absent → `undefined`; field exactly `null` → `null`; a string → the string; anything
else → `ValidationError` with the same message shape as `readOptionalString`.

`server/api/funds/[id].patch.ts` uses `readClearableString(body, 'providerSymbol')` instead of
`readOptionalString`. `name` keeps `readOptionalString`. `updateFund` in `server/db/queries.ts`
already types `providerSymbol?: string | null` and Drizzle skips `undefined` keys, so **no query
change is needed**.

**Tests.** In `server/utils/validation.test.ts`, four `it`s over `readClearableString` covering the
four rules above. In `test/routes/funds.test.ts`, one `it` doing the round trip:
`PATCH /api/funds/world { providerSymbol: '0P0001CLDK.F' }` → body has that symbol;
`PATCH /api/funds/world { providerSymbol: null }` → body has `providerSymbol: null`;
`PATCH /api/funds/world { name: 'Fidelity MSCI World Index Fund EUR P Acc' }` → `providerSymbol`
is still `null`, proving an absent field does not clear it.

**Verify:** write the route test first, run `pnpm test --project routes test/routes/funds.test.ts`
and paste the failure (the second assertion returns the old symbol), then implement, then run both
`pnpm test --project server server/utils/validation.test.ts` and the route file green.

---

## Task 1.6 — NAV routes (9, 10, 11)

**Depends on:** 1.2.

**File:** `test/routes/nav.test.ts` (new).

**This file must never set a `providerSymbol` on any fund**, so that the sync test cannot reach the
network.

**Tests.**

1. `GET /api/nav?fundId=world` on the seeded database → `{ fundId: 'world', navs: [] }`.
2. `PUT /api/nav` with `{ fundId: 'world', date: '2026-07-01', value: '10.0000' }` → body
   `{ fundId: 'world', date: '2026-07-01', value: '10.0000', source: 'manual' }`, with no `id` key.
3. A second `PUT` for the same fund and date with `value: '11.0000'` replaces it: a following
   `GET /api/nav?fundId=world` returns exactly one entry, valued `'11.0000'`.
4. `GET /api/nav?fundId=world&from=2026-07-01&to=2026-07-01` returns that one entry;
   `&from=2026-08-01` returns none.
5. `PUT /api/nav` with `value: '0'` → 400; with `value: '-1'` → 400; with `value: 10` (a JSON
   number) → 400.
6. `PUT /api/nav` with `date: '2099-01-01'` → 400 (later than today).
7. `PUT /api/nav` with `fundId: 'ghost'` → 404.
8. `POST /api/nav/sync` with `{ fundIds: [] }` → `{ funds: [] }`. **No socket:** an empty array
   filters every fund out.
9. `POST /api/nav/sync` with an empty body → `funds` has two entries, both
   `{ fundId, status: 'skipped', reason: 'no-symbol' }`, one for `world` and one for `emerging`.
   **No socket:** neither seeded fund has a `providerSymbol`, and the service skips before
   constructing a request.

**Verify:** `pnpm test --project routes test/routes/nav.test.ts`. Then confirm no network access by
re-running the file with the machine offline, or by asserting in the report that no test in it names
a symbol.

---

## Task 1.7 — Contribution routes (12, 13, 14, 15, 16, 17)

**Depends on:** 1.2.

**File:** `test/routes/contributions.test.ts` (new).

**Tests.**

1. `GET /api/contributions?from=2026-07&to=2026-09` on the seeded database returns `rules` of length
   2, `overrides` empty, and `months` of length 3:
   `[{ month: '2026-07', amount: 200000, timing: 'start', weights: [...80/20...], materialised: false },
   { month: '2026-08', amount: 20000, ... }, { month: '2026-09', amount: 20000, ... }]`.
2. `GET /api/contributions` with no `from` → 400. With `from=2026-13` → 400.
3. `POST /api/contributions/rules` with
   `{ fromMonth: '2027-01', amount: 30000, timing: 'end', weights: [{ fundId: 'world', weight: 0.8 },
   { fundId: 'emerging', weight: 0.2 }] }` → 201, and a following
   `GET /api/contributions?from=2026-12&to=2027-01` shows `2026-12` at 20000 and `2027-01` at 30000.
   **This is the rule of section 4 of the spec: a new rule never rewrites the past.**
4. `POST /api/contributions/rules` repeating `fromMonth: '2027-01'` → 409.
5. `POST /api/contributions/rules` with weights summing to 0,9 → 400; with a repeated `fundId` → 400.
6. `PATCH /api/contributions/rules/:id` with `{ amount: 25000 }` on the rule created in 3 returns
   `amount: 25000`.
7. `PATCH /api/contributions/rules/:id` with `{ fromMonth: '2027-02' }` → 400, **and also with
   `{ fromMonth: null }` → 400** — the check is `hasField`, not a value check.
8. `PATCH /api/contributions/rules/999999` → 404. `DELETE /api/contributions/rules/999999` → 404.
9. `DELETE /api/contributions/rules/:id` on the rule from 3 → 204, and `GET /api/contributions`
   shows `2027-01` back at 20000.
10. `PUT /api/contributions/overrides/2026-09` with `{ amount: null, note: 'Mes saltado' }` → the
    override row, and `GET /api/contributions?from=2026-09&to=2026-09` shows `months[0].amount === 0`.
    *(Assert whatever `expandContributions` actually produces for a skipped month — run it and read
    the value rather than guessing; if the month is absent from `months` altogether, assert that
    instead, and say so in the report.)*
11. `PUT` the same month again with `{ amount: 50000 }` replaces rather than duplicates: `overrides`
    has length 1 and `months[0].amount === 50000`.
12. `DELETE /api/contributions/overrides/2026-09` → 204; a second `DELETE` → 404.
13. `PUT /api/contributions/overrides/2026-13` → 400.

**Verify:** `pnpm test --project routes test/routes/contributions.test.ts`

---

## Task 1.8 — Purchase routes (18, 19, 20, 21, 22)

**Depends on:** 1.2.

**File:** `test/routes/purchases.test.ts` (new).

**Arrange.** Several tests need NAVs. Insert them directly through `database.db` with `upsertNav`
from `server/db/queries`, choosing round values so the expected units are exact:
`world` at `'10'` and `emerging` at `'20'`, both on `2026-07-01` and on `2026-08-03`.

**Tests.**

1. `GET /api/purchases` on the seeded database → `[]`.
2. `POST /api/purchases` with `{ fundId: 'world', month: '2026-07', date: '2026-07-01', amount:
   160000, nav: '10' }` → 201, body `{ id, portfolioId: 'index', fundId: 'world', month: '2026-07',
   date: '2026-07-01', amount: 160000, nav: '10', units: '160.000000', source: 'manual' }`.
   1.600 € at 10 € a unit is 160 units — `unitsFor` divides cents by 100 and then by the NAV.
3. `POST /api/purchases` with an explicit `units: '159.500000'` keeps that value rather than
   recomputing it.
4. `POST /api/purchases` with `fundId: 'ghost'` → 404. With `nav: 10` (a JSON number) → 400. With
   `month: '2026-7'` → 400.
5. `PATCH /api/purchases/:id` with `{ nav: '20' }` on the purchase from 2 returns
   `units: '80.000000'` — the units are recomputed from the merged amount and NAV.
6. `PATCH /api/purchases/:id` with `{ date: '2026-07-02' }` alone leaves `units` unchanged.
7. `PATCH /api/purchases/999999` → 404. `DELETE /api/purchases/999999` → 404.
8. `GET /api/purchases?fundId=emerging` returns none while only `world` purchases exist;
   `?from=2026-08-01` returns none while the only purchase is dated `2026-07-01`.
9. `DELETE /api/purchases/:id` → 204, and `GET /api/purchases` → `[]`.
10. **Materialisation, with everything deleted first so the count is unambiguous:**
    `POST /api/purchases/materialise` with `{ throughMonth: '2026-08' }` → `created` has length 4
    (two months × two funds) and `skipped` is empty. The `2026-07` world purchase carries
    `amount: 160000`, `nav: '10'`, `units: '160.000000'`, `date: '2026-07-01'`, `source: 'auto'`;
    the `2026-07` emerging one carries `amount: 40000`, `nav: '20'`, `units: '20.000000'`.
11. **Idempotency:** an immediate second `POST /api/purchases/materialise` with the same body →
    `created` empty, `skipped` equal to
    `[{ month: '2026-07', reason: 'already-materialised' }, { month: '2026-08', reason: 'already-materialised' }]`.
12. **Editing a rule does not rewrite an executed purchase:**
    `PATCH /api/contributions/rules/:id` raising the `2026-08` rule from 20000 to 30000, then
    `POST /api/purchases/materialise` again → `created` empty, and `GET /api/purchases` still shows
    the `2026-08` world purchase at `amount: 16000`. This is the invariant of section 4 of the spec.
13. `POST /api/purchases/materialise` with `{ throughMonth: '2026-7' }` → 400.

**Verify:** `pnpm test --project routes test/routes/purchases.test.ts`

---

## Task 1.9 — Scenario routes (23, 24, 25, 26)

**Depends on:** 1.2.

**File:** `test/routes/scenarios.test.ts` (new).

**Tests.**

1. `GET /api/scenarios` on the seeded database returns three rows, ids `flat`, `moderate`,
   `optimistic`, with `annualRate` `'0'`, `'0.05'`, `'0.09'`, colours `chart-3`, `chart-2`,
   `chart-1`, and `enabled: 1` on all three. **`enabled` is an integer, not a boolean, in the row
   shape** — assert what the route actually returns.
2. `POST /api/scenarios` with `{ id: 'pesimista', name: 'Escenario pesimista', annualRate: '0.02',
   color: 'chart-4' }` → 201.
3. `POST /api/scenarios` repeating `id: 'pesimista'` → 409.
4. `POST /api/scenarios` with `annualRate: 0.02` (a JSON number) → 400; with `id: ''` → 400.
5. `PATCH /api/scenarios/pesimista` with `{ enabled: false }` → the row with `enabled: 0`, and
   `GET /api/dashboard?asOf=2026-08-06` then lists only the three enabled scenarios in
   `series.scenarios`, `pesimista` absent. **This is what the scenarios screen of phase 7 relies on.**
6. `PATCH /api/scenarios/does-not-exist` → 404.
7. `DELETE /api/scenarios/pesimista` → 204; a second `DELETE` → 404.
8. **A finding, not a fix:** `POST /api/scenarios` with `color: '#ff0000'` currently succeeds. Assert
   the 201 as the current behaviour and add an inline comment naming it as the open finding from
   `TODO.md` — *scenario `color` is not restricted to the `chart-1` … `chart-5` tokens* — so the
   test documents the gap rather than pretending it is closed. Delete the row afterwards.

**Verify:** `pnpm test --project routes test/routes/scenarios.test.ts`

---

## Ending condition for phase 1

- `pnpm test --project routes` green, with all 26 routes exercised across the six files.
- `pnpm test` green as a whole (the three earlier projects plus this one).
- `pnpm typecheck` exits 0.
- No test file under `test/routes/` names a real ISIN in a `/api/funds/resolve` call, and no file
  that sets a `providerSymbol` also calls `/api/nav/sync`.
- The report states, per file, which route numbers from plan 2's table it covers, so the 26 can be
  counted.
