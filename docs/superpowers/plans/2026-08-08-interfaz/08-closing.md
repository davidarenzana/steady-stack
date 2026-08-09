# Phase 8 — Closing

**Goal:** prove the whole thing holds together, audit the invariants this plan claimed rather than
assuming them, and leave the repository's documentation telling the truth about where the project
stands.

**Prerequisite:** phases 1 to 7 closed.

**Verification of the whole phase:** every command below run for real, with its output pasted into
the report. Nothing here is declared done from memory.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [x] Task 8.1 — The invariant audit
- [ ] Task 8.2 — The whole suite, the build, and the production server
- [ ] Task 8.3 — `README.md` and `TODO.md`

### What the audit of task 8.1 found

Every one of the thirteen claims holds. Two of the commands needed correcting rather than the code,
and both corrections are recorded here so the next reader does not repeat the confusion:

- **`grep -rl "@unovis" app/` returns two files, not one**: `EvolutionChart.vue` and
  `EvolutionChart.test.ts`. The test's hit is the `vi.mock('@unovis/vue')` string that phase 4
  mandated, so the invariant — one *component* touches Unovis — holds. The command as written
  cannot express that.
- **The `core/` baseline in the table is wrong.** `3ffb298` closed plan 2's *phases 1 to 4*, not
  plan 2; `core/purchases.ts` gained `unitsFor` afterwards in `90fd8af`, which is plan 2's own route
  phase. Against `5e01913`, the commit that actually closed plan 2, `git diff --stat 5e01913 HEAD --
  core/` is empty: plan 3 changed nothing under `core/`.

Also confirmed by reading: **no component performs arithmetic on money.** The only arithmetic in
`app/` outside `format.ts`, `parse.ts`, `rate.ts` and `centsToEuros` is on things that are not money
— percentages summed to 100 in `RuleForm.vue`, a count of years in `HorizonForm.vue`, and month
indices in `evolution-range.ts`.

---

## Task 8.1 — The invariant audit

**Depends on:** phases 1 to 7.

**Files:** none changed unless the audit finds something.

Run each command and record the output. Every one of these encodes a constraint this plan made; a
failure is a finding, and either the code or the constraint has to move.

| Claim | Command | Expected |
|---|---|---|
| Only one file imports Unovis | `grep -rl "@unovis" app/` | exactly `app/components/chart/EvolutionChart.vue` |
| The interface never value-imports from `server/` | `grep -rn "from '~~/server" app/ \| grep -v "import type"` | no output |
| The interface never imports Drizzle | `grep -rn "drizzle-orm\|better-sqlite3" app/` | no output |
| `core/` was not touched | `git diff --stat main -- core/` (against the commit that closed plan 2) | no output |
| No hex colours in charts or legends | `grep -rn "#[0-9a-fA-F]\{6\}" app/components/chart app/components/scenarios` | no output |
| Figures are formatted in one place | `grep -rn "toFixed\|Intl\.\|toLocaleString" app/components app/pages` | no output |
| The deprecated icon package is absent | `grep -rn "lucide-vue-next" app/ package.json` | no output |
| The theme is still hand-written | `grep -c "chart-5" app/assets/css/tailwind.css` | at least 3 (`:root`, `.dark`, `@theme`) |
| Inter is gone | `grep -c "Inter" app/assets/css/tailwind.css` | `0` |
| Every route has a test | count the `it`s in `test/routes/` against plan 2's 26-row table | all 26 paths appear |
| No figure animates on load | `grep -rn "transition\|animate-\|duration-" app/components/dashboard` | no hit on an element rendering a figure |
| The chart does not default to the whole horizon | `pnpm test --project app -t 'shows the recent window by default'` | green |
| Gain and loss are never colour alone | read `HeadlineValuation.vue`: the `+`/`-` sign and the `aria-label` are both present | confirmed by reading |

Also confirm by reading, not by grep: **no component performs arithmetic on money.** The only
permitted numeric operations in `app/` are inside `app/utils/format.ts`, `app/utils/parse.ts`,
`app/utils/rate.ts` and `centsToEuros` in `app/components/chart/evolution-series.ts`. Anything else
adding, subtracting or dividing a `Cents` value is a finding for task 8.3.

**Verify:** the table above, with the real output of each command.

---

## Task 8.2 — The whole suite, the build, and the production server

**Depends on:** 8.1.

**Files:** none.

Run, in this order, and paste each result:

```sh
pnpm test          # every project: core, server, routes, app
pnpm typecheck     # vue-tsc over the whole project, TypeScript pinned at 5.9.3
pnpm build         # production build
```

Then the production server, which is where plan 2's last finding lived — a `.output` server started
from any directory other than the project root threw `Can't find meta/_journal.json file` on every
database-backed route, and silently created a stray empty database under that directory's own
`data/`. Phase 1, task 1.1 was supposed to close both halves of that. Prove it:

```sh
# From the project root, against the real database.
node .output/server/index.mjs &
curl -s localhost:3000/api/portfolio | head -c 200
curl -s localhost:3000/ | grep -c "Steady Stack"

# From somewhere else, with both paths given explicitly.
cd /tmp && STEADY_STACK_DATABASE_FILE=/tmp/steady-check.db \
  STEADY_STACK_MIGRATIONS_DIR=<project>/server/db/migrations \
  node <project>/.output/server/index.mjs &
curl -s localhost:3000/api/portfolio
```

The second run answers a 404 from `buildPortfolioView` — `/tmp/steady-check.db` is migrated but never
seeded, so there is no portfolio row — and **that is the correct answer**: it proves the server read
the environment variables and did not touch `data/steady-stack.db`. Confirm afterwards that no `data/`
directory was created under `/tmp`, then delete `/tmp/steady-check.db` and its `-wal` and `-shm`
sidecars.

Record whether starting from another directory **without** those variables still fails. If it does,
that half of the finding stays open and goes into task 8.3 — this plan improved it from
"unavoidable" to "avoidable with two variables", which is a smaller claim than fixing it.

**Verify:** the commands above, with output.

---

## Task 8.3 — `README.md` and `TODO.md`

**Depends on:** 8.1, 8.2.

**Files:** `README.md`, `TODO.md`.

**`README.md`.** Update the *Status* section:

- The table gains rows for the interface: route tests, formatting and typography, the dashboard, the
  evolution chart, contributions, funds, scenarios — all `done`.
- The paragraph claiming *there is no automated coverage of the HTTP layer yet, which is the first
  thing the next plan adds* is replaced with the real count of route tests and the fact that all 26
  routes are covered.
- The paragraph claiming *there is no interface yet either, so there is nothing to open in a browser
  except the raw JSON each route returns* is replaced by a short description of the four screens, in
  English, with any figure in Spanish typography.
- The test-count line is updated to the real total from task 8.2.
- Add `pnpm test:fast` and `pnpm test:routes` to the commands block, explaining that the routes
  project builds a real Nuxt server per test file and costs roughly two minutes, which is why the
  inner loop has its own script.
- Mention the two environment variables, `STEADY_STACK_DATABASE_FILE` and
  `STEADY_STACK_MIGRATIONS_DIR`, and what a deployed process should set them to.

**`TODO.md`.** Rewrite it around what is now open, keeping the structure it has:

- *Next up* becomes plan 4, whatever the human partner decides it is. Do not invent its scope; state
  that the interface is complete against spec section 8 and that section 15 lists what v2 holds.
- **Close** the two findings this plan settled: `PATCH /api/funds/:id` can now clear
  `providerSymbol` (phase 1, task 1.5), and `buildFundsView`'s zero-value gap is now handled at the
  screen — struck through, with the ruling recorded, since the read model itself is unchanged.
- **Keep open**, untouched by this plan: purchase and rule amounts accepting zero and negative
  values; scenario `color` unrestricted at the API; fund `currency` accepting an empty string;
  `purchases.date` not future-bounded; `@types/better-sqlite3` at 9.6.0 against a 13.0.3 runtime; the
  duplicated snapshot-and-diff logic between `scripts/sync-nav.ts` and
  `server/services/nav-sync.ts`; and the five deferred phase-1 findings and two phase-2 findings
  carried over from plan 2. Note against the first four that **the interface now refuses what the API
  still accepts**, which narrows the exposure without closing it.
- **Close** the typography entry: Inter is gone, IBM Plex Sans is in, chosen against real columns of
  figures, and the hook exception was never registered because the decision has now been made rather
  than silenced.
- **Add** the findings this plan produced. At minimum, and only if the phases that found them said
  so:
  - `GET /api/contributions` returns `rules[].weights` as a serialised JSON string rather than a
    `Weight[]`, so the interface parses it by hand (phase 5). The fix is for the route to map the row
    through `toContributionRule`.
  - `GET /api/contributions` returns no per-fund euro split, so the contributions screen shows
    weights as percentages instead of `160,00 € / 40,00 €` (phase 5). The fix is for the route to
    return the result of `split()` per month, since that is the canonical largest-remainder split and
    the interface may not do arithmetic on money.
  - Whether a `.output` server started outside the project root still fails without the two
    environment variables (phase 8, task 8.2).
  - Anything task 8.1's audit turned up.
- **Record what has no automated coverage**: the pages themselves are exercised only through their
  server-rendered HTML in `test/routes/pages.test.ts`; nothing clicks a button, because end-to-end
  browser tests are out of v1 by section 15 of the spec. Forms are covered as components — the
  payload they emit — and the actions that send those payloads are covered by the route tests, but
  the wiring between the two is verified by a person, not by a machine.

**Verify:** read both files end to end and confirm no sentence in either still describes a state that
stopped being true. `grep -n "pendiente\|pending\|not written\|yet" README.md TODO.md` and check each
hit deliberately.

---

## Ending condition for phase 8, and for the plan

- `pnpm test` green in full, with the total recorded.
- `pnpm typecheck` and `pnpm build` exit 0.
- A production `.output` server started and exercised, from the project root and from elsewhere.
- The audit table of task 8.1 passing, or every failure recorded as a finding.
- `README.md` and `TODO.md` describing the project as it now is.
- The four screens of section 8 of the spec open in a browser and do what the spec says they do:
  a dashboard with the value, what was paid in, the capital gain in euros and percent, the XIRR and
  the evolution chart; contributions with rules, exceptions and the monthly table; funds with ISIN
  resolution, symbol choice, current NAV and a refresh button; scenarios with configurable rates and
  horizon.
