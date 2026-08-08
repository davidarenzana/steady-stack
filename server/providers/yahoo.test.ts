import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadFixture } from './__fixtures__/load'
import { createYahooProvider, parseChartResponse, parseSearchResponse } from './yahoo'

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url))

function fixture(relativePath: string): unknown {
  return loadFixture(FIXTURES_DIR, relativePath)
}

describe('parseChartResponse', () => {
  it('drops the trailing nulls of the publication lag', () => {
    const result = parseChartResponse(fixture('handmade/chart-trailing-nulls.json'), '0P0001CLDK.F')

    expect(result).toEqual({
      symbol: '0P0001CLDK.F',
      currency: 'EUR',
      points: [
        { date: '2026-08-04', value: '14.1042' },
        { date: '2026-08-05', value: '14.2772' },
      ],
    })
  })

  it('strips the floating point noise Yahoo sends', () => {
    // Yahoo answers 14.10420036315918 for a fund published at 14,1042 €.
    const result = parseChartResponse(fixture('handmade/chart-trailing-nulls.json'), '0P0001CLDK.F')

    expect(result.points[0]!.value).toBe('14.1042')
    expect(result.points[0]!.value).not.toContain('0036315918')
  })

  it('skips a gap in the middle without shifting the dates', () => {
    const result = parseChartResponse(fixture('handmade/chart-inner-gap.json'), '0P0001CLDK.F')

    expect(result.points).toEqual([
      { date: '2026-08-04', value: '14.1042' },
      { date: '2026-08-06', value: '14.33' },
    ])
  })

  it('turns a Yahoo error payload into a PriceProviderError', () => {
    expect(() => parseChartResponse(fixture('handmade/chart-error.json'), 'BOGUS'))
      .toThrow('Yahoo returned no chart data for "BOGUS": No data found, symbol may be delisted')
  })

  it('rejects a payload that is not a chart response', () => {
    expect(() => parseChartResponse({ nope: true }, 'BOGUS'))
      .toThrow('Yahoo returned no chart data for "BOGUS"')
  })

  it('dates a point by the exchange day, not by UTC, when the timestamp sits past UTC midnight', () => {
    // 1785884400 is 2026-08-04T23:00:00Z. Left as raw UTC it falls on
    // 2026-08-04; the exchange is two hours ahead (gmtoffset 7200), so the
    // actual close belongs to 2026-08-05. Getting this wrong files a
    // purchase in the wrong month.
    const result = parseChartResponse(fixture('handmade/chart-gmtoffset-boundary.json'), '0P0001CLDK.F')

    expect(result.points).toEqual([{ date: '2026-08-05', value: '14.33' }])
  })

  it('treats a missing gmtoffset as 0', () => {
    const payload = {
      chart: {
        result: [
          {
            meta: { currency: 'EUR' },
            timestamp: [1785884400],
            indicators: { quote: [{ close: [14.33] }] },
          },
        ],
        error: null,
      },
    }

    const result = parseChartResponse(payload, '0P0001CLDK.F')

    expect(result.points).toEqual([{ date: '2026-08-04', value: '14.33' }])
  })

  it('returns an empty series when Yahoo resolves the symbol but publishes no data', () => {
    // Real, unaltered Yahoo output for IE00BYX5NX33.SG: meta and indicators
    // only, no timestamp key at all, and chart.error is null. The symbol is
    // valid, it simply has no data on that exchange — not an exception.
    const result = parseChartResponse(fixture('recorded/chart-IE00BYX5NX33.SG.json'), 'IE00BYX5NX33.SG')

    expect(result).toEqual({
      symbol: 'IE00BYX5NX33.SG',
      currency: 'EUR',
      points: [],
    })
  })
})

describe('parseSearchResponse', () => {
  it('returns every candidate and picks none', () => {
    const result = parseSearchResponse(fixture('handmade/search-two-candidates.json'), 'IE00BYX5NX33')

    expect(result).toEqual([
      { symbol: 'IE00BYX5NX33.SG', name: 'Fidelity MSCI World Index Fund', exchange: 'Stuttgart' },
      { symbol: '0P0001CLDK.F', name: 'Fidelity MSCI World Index Fund', exchange: 'Frankfurt' },
    ])
  })

  it('returns an empty list when the ISIN matches nothing', () => {
    expect(parseSearchResponse(fixture('handmade/search-empty.json'), 'XX0000000000')).toEqual([])
  })

  it('drops entries with no quoteType, which is how news and industry results are mixed in', () => {
    const payload = {
      count: 2,
      quotes: [
        { symbol: 'SOME-NEWS-ID', shortname: 'An unrelated headline' },
        { symbol: '0P0001CLDK.F', quoteType: 'MUTUALFUND', shortname: '0P0001CLDK.F', exchDisp: 'Frankfurt' },
      ],
    }

    expect(parseSearchResponse(payload, 'IE00BYX5NX33')).toEqual([
      { symbol: '0P0001CLDK.F', name: '0P0001CLDK.F', exchange: 'Frankfurt' },
    ])
  })

  it('rejects a payload that is not a search response', () => {
    expect(() => parseSearchResponse({ nope: true }, 'IE00BYX5NX33'))
      .toThrow('Yahoo returned no search results for "IE00BYX5NX33"')
  })
})

describe('the recorded responses', () => {
  it('offers several share classes for the same ISIN', () => {
    const result = parseSearchResponse(fixture('recorded/search-IE00BYX5NX33.json'), 'IE00BYX5NX33')
    const symbols = result.map(c => c.symbol)

    expect(symbols.length).toBeGreaterThanOrEqual(2)
    expect(symbols).toContain('0P0001CLDK.F')
    expect(symbols).toContain('IE00BYX5NX33.SG')
  })

  it('finds the emerging markets fund', () => {
    const result = parseSearchResponse(fixture('recorded/search-IE0031786696.json'), 'IE0031786696')

    expect(result.map(c => c.symbol)).toContain('0P00012I6A.F')
  })

  it('reads a daily series in euros with no gaps left in it', () => {
    const result = parseChartResponse(fixture('recorded/chart-0P0001CLDK.F.json'), '0P0001CLDK.F')

    expect(result.currency).toBe('EUR')
    expect(result.points.length).toBeGreaterThan(200)
    expect(result.points.every(p => /^\d+(\.\d{1,4})?$/.test(p.value))).toBe(true)
    expect(result.points.map(p => p.date)).toEqual([...result.points.map(p => p.date)].sort())
    expect(new Set(result.points.map(p => p.date)).size).toBe(result.points.length)
  })

  it('never conflates the two share classes of one ISIN into a single series', () => {
    // The recorded fixture for IE00BYX5NX33.SG is the "no data" shape: the
    // symbol resolves but published nothing on the day of capture. Frankfurt
    // has a real series that day. The parser keeps the two symbols entirely
    // separate rather than falling back from one to the other — which is
    // exactly why nothing is guessed.
    const frankfurt = parseChartResponse(fixture('recorded/chart-0P0001CLDK.F.json'), '0P0001CLDK.F')
    const stuttgart = parseChartResponse(fixture('recorded/chart-IE00BYX5NX33.SG.json'), 'IE00BYX5NX33.SG')

    expect(frankfurt.points.length).toBeGreaterThan(0)
    expect(stuttgart.points).toEqual([])
  })
})

describe('createYahooProvider', () => {
  it('never touches the network when a fetcher is injected', async () => {
    const urls: string[] = []
    const provider = createYahooProvider({
      fetchJson: async (url) => {
        urls.push(url)
        return url.includes('/search')
          ? fixture('handmade/search-two-candidates.json')
          : fixture('handmade/chart-trailing-nulls.json')
      },
    })

    const candidates = await provider.resolve('IE00BYX5NX33')

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toEqual({
      symbol: 'IE00BYX5NX33.SG',
      name: 'Fidelity MSCI World Index Fund',
      exchange: 'Stuttgart',
      currency: 'EUR',
      price: '14.2772',
      priceDate: '2026-08-05',
    })
    expect(urls[0]).toContain('q=IE00BYX5NX33')
  })

  it('clips the history to the requested window', async () => {
    const provider = createYahooProvider({
      fetchJson: async () => fixture('handmade/chart-trailing-nulls.json'),
    })

    await expect(provider.history('0P0001CLDK.F', '2026-08-05', '2026-08-31')).resolves.toEqual([
      { date: '2026-08-05', value: '14.2772' },
    ])
  })

  it('identifies itself as yahoo, which is what lands in nav.source', () => {
    expect(createYahooProvider().id).toBe('yahoo')
  })

  it('resolves a candidate with price: null when its chart call fails', async () => {
    const provider = createYahooProvider({
      fetchJson: async (url) => {
        if (url.includes('/search')) return fixture('handmade/search-two-candidates.json')
        throw new Error('network down')
      },
    })

    const candidates = await provider.resolve('IE00BYX5NX33')

    expect(candidates).toEqual([
      {
        symbol: 'IE00BYX5NX33.SG',
        name: 'Fidelity MSCI World Index Fund',
        exchange: 'Stuttgart',
        currency: null,
        price: null,
        priceDate: null,
      },
      {
        symbol: '0P0001CLDK.F',
        name: 'Fidelity MSCI World Index Fund',
        exchange: 'Frankfurt',
        currency: null,
        price: null,
        priceDate: null,
      },
    ])
  })

  it('returns an empty candidate list for an ISIN Yahoo does not recognise', async () => {
    const provider = createYahooProvider({
      fetchJson: async () => fixture('handmade/search-empty.json'),
    })

    await expect(provider.resolve('XX0000000000')).resolves.toEqual([])
  })

  it('rejects a non-2xx response from the default fetcher', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' })) as typeof fetch

    try {
      const provider = createYahooProvider()
      await expect(provider.resolve('IE00BYX5NX33')).rejects.toThrow('503')
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('the network guard', () => {
  // `STEADY_STACK_FORBID_NETWORK` is read from `process.env` inside
  // `defaultFetchJson`, which has no seam for injecting an env object — its
  // signature is fixed by `PriceProvider`'s `fetchJson` contract. Mutating
  // `process.env` for the duration of one `it`, restored in `finally`, is
  // the same trade-off `globalThis.fetch` gets in the test above.
  it('refuses a real request when no fixture matches it', async () => {
    const original = process.env.STEADY_STACK_FORBID_NETWORK
    process.env.STEADY_STACK_FORBID_NETWORK = '1'

    try {
      const provider = createYahooProvider()
      await expect(provider.resolve('XX0000000000')).rejects.toThrow(
        'Refused a real network request in a test: https://query2.finance.yahoo.com/v1/finance/search?q=XX0000000000',
      )
    }
    finally {
      if (original === undefined) delete process.env.STEADY_STACK_FORBID_NETWORK
      else process.env.STEADY_STACK_FORBID_NETWORK = original
    }
  })

  it('serves a committed fixture instead of the network when one matches the request', async () => {
    const original = process.env.STEADY_STACK_FORBID_NETWORK
    process.env.STEADY_STACK_FORBID_NETWORK = '1'

    try {
      const provider = createYahooProvider()
      const candidates = await provider.resolve('IE00BYX5NX33')
      const symbols = candidates.map(c => c.symbol)

      expect(symbols).toContain('0P0001CLDK.F')
      expect(symbols).toContain('IE00BYX5NX33.SG')
      // A price other than null only happens if the guard actually served
      // the recorded chart fixture rather than silently returning nothing.
      expect(candidates.find(c => c.symbol === '0P0001CLDK.F')?.price).not.toBeNull()
    }
    finally {
      if (original === undefined) delete process.env.STEADY_STACK_FORBID_NETWORK
      else process.env.STEADY_STACK_FORBID_NETWORK = original
    }
  })
})
