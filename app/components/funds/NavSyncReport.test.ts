import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { NavSyncResult } from '~~/server/services/nav-sync'
import NavSyncReport from './NavSyncReport.vue'

const FUND_NAMES = {
  world: 'Fidelity MSCI World Index Fund EUR P Acc',
  emerging: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
}

function report(...funds: NavSyncResult['funds']): NavSyncResult {
  return { funds }
}

describe('NavSyncReport', () => {
  it('reports what was downloaded and how far it got', async () => {
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({
          fundId: 'world',
          status: 'synced',
          inserted: 27,
          updated: 0,
          to: '2026-08-03',
        }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('Fidelity MSCI World Index Fund EUR P Acc')
    expect(wrapper.text()).toContain('27 valores nuevos')
    expect(wrapper.text()).toContain('0 actualizados')
    expect(wrapper.text()).toContain('hasta el 03/08/2026')
  })

  it('says which funds could not be synced and why', async () => {
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({ fundId: 'emerging', status: 'skipped', reason: 'no-symbol' }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('Vanguard Emerging Markets Stock Index Fund Inv EUR Acc')
    expect(wrapper.text()).toContain('sin símbolo asignado, no se ha podido sincronizar')
  })

  it('reports a fund that was already up to date without pretending it downloaded anything', async () => {
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({ fundId: 'world', status: 'up-to-date' }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('ya estaba al día')
    expect(wrapper.text()).not.toContain('valores nuevos')
  })

  it('says that hand-entered values were respected', async () => {
    // Section 6 of the spec: a NAV entered by hand always prevails over a
    // downloaded one. The sync counts what it left alone, and a report that
    // stayed silent about it would look like values had gone missing.
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({
          fundId: 'world',
          status: 'synced',
          inserted: 26,
          updated: 0,
          to: '2026-08-03',
          skippedManual: 1,
        }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('1 manuales respetados')
  })

  it('does not mention respected manual values when there were none', async () => {
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({
          fundId: 'world',
          status: 'synced',
          inserted: 27,
          updated: 0,
          to: '2026-08-03',
          skippedManual: 0,
        }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).not.toContain('manuales respetados')
  })

  it('reports a fund whose outcome is unknown after a failed run', async () => {
    // The fourth status, which the plan's table omits and the partial report of
    // a 502 produces: `incomplete` means the sync threw before this fund's rows
    // moved, and there is no way to tell a fund that failed from one that never
    // got its turn.
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({ fundId: 'emerging', status: 'incomplete' }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('no se ha podido comprobar')
  })

  it('lists every fund of the report, in the order given', async () => {
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report(
          { fundId: 'world', status: 'synced', inserted: 27, updated: 0, to: '2026-08-03' },
          { fundId: 'emerging', status: 'skipped', reason: 'no-symbol' },
        ),
        fundNames: FUND_NAMES,
      },
    })

    const lines = wrapper.findAll('[data-testid="sync-line"]')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text()).toContain('27 valores nuevos')
    expect(lines[1]!.text()).toContain('sin símbolo asignado')
  })

  it('falls back to the fund id when its name is unknown', async () => {
    // The report can name a fund the current `GET /api/funds` payload does not
    // carry — one deleted between the sync and the refresh — and an empty line
    // would be worse than a technical one.
    const wrapper = mount(NavSyncReport, {
      props: {
        report: report({ fundId: 'gone', status: 'up-to-date' }),
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.text()).toContain('gone: ya estaba al día')
  })

  it('renders nothing at all before a sync has run', async () => {
    const wrapper = mount(NavSyncReport, { props: { report: null, fundNames: FUND_NAMES } })

    expect(wrapper.text()).toBe('')
  })
})
