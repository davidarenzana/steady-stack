import { describe, expect, it } from 'vitest'
import { createManualProvider } from './manual'

const ENTRIES = {
  world: [
    { date: '2026-08-03', value: '14.8321' },
    { date: '2026-08-04', value: '14.9100' },
    { date: '2026-08-05', value: '15.0000' },
  ],
}

describe('createManualProvider', () => {
  it('identifies itself as manual', () => {
    expect(createManualProvider({}).id).toBe('manual')
  })

  it('returns the entries inside the window, both ends included', async () => {
    const provider = createManualProvider(ENTRIES)

    await expect(provider.history('world', '2026-08-04', '2026-08-05')).resolves.toEqual([
      { date: '2026-08-04', value: '14.9100' },
      { date: '2026-08-05', value: '15.0000' },
    ])
  })

  it('returns an empty series for an unknown symbol', async () => {
    const provider = createManualProvider(ENTRIES)

    await expect(provider.history('ghost', '2026-08-01', '2026-08-31')).resolves.toEqual([])
  })

  it('sorts the entries by date even when they arrive shuffled', async () => {
    const provider = createManualProvider({
      world: [
        { date: '2026-08-05', value: '15.0000' },
        { date: '2026-08-03', value: '14.8321' },
      ],
    })

    await expect(provider.history('world', '2026-08-01', '2026-08-31')).resolves.toEqual([
      { date: '2026-08-03', value: '14.8321' },
      { date: '2026-08-05', value: '15.0000' },
    ])
  })

  it('resolves nothing: a hand-kept list has no catalogue to search', async () => {
    await expect(createManualProvider(ENTRIES).resolve('IE00BYX5NX33')).resolves.toEqual([])
  })
})
