import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Reads and parses one committed Yahoo fixture, addressed by a path relative
 * to the `__fixtures__` directory it lives under — e.g.
 * `recorded/search-IE00BYX5NX33.json`.
 *
 * The single loader both `yahoo.test.ts` and the network guard in `yahoo.ts`
 * use, so a fixture is read from disk exactly one way in this repository.
 * Throws `ENOENT` untouched when the file does not exist: callers decide
 * what a missing fixture means for them.
 */
export function loadFixture(fixturesDir: string, relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), 'utf8'))
}
