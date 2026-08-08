import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FundPositionsTable from './FundPositionsTable.vue'
import { makePosition } from '~/test-utils/fixtures'

describe('FundPositionsTable', () => {
  it('renders a position with every figure in Spanish typography', () => {
    // 160 units at 11 € is 1.760 €, against 1.600 € paid in: up 160 €.
    const wrapper = mount(FundPositionsTable, { props: { positions: [makePosition()] } })
    const text = wrapper.text()

    expect(text).toContain('Fidelity MSCI World Index Fund EUR P Acc')
    expect(text).toContain('160,0000')
    expect(text).toContain('11,0000 €')
    expect(text).toContain('03/08/2026')
    expect(text).toContain('1.600,00 €')
    expect(text).toContain('1.760,00 €')
    expect(text).toContain('+160,00 €')
  })

  it('heads every column in Spanish, in order', () => {
    const wrapper = mount(FundPositionsTable, { props: { positions: [makePosition()] } })

    expect(wrapper.findAll('th').map(header => header.text())).toEqual([
      'Fondo',
      'Participaciones',
      'Valor liquidativo',
      'Fecha',
      'Aportado',
      'Valor',
      'Plusvalía',
    ])
  })

  it('right-aligns every numeric cell and gives it tabular numerals', () => {
    // This table is the column of figures IBM Plex Sans was chosen for in
    // phase 2. Without both classes the digits neither line up nor sit under
    // one another.
    const wrapper = mount(FundPositionsTable, { props: { positions: [makePosition()] } })
    const cells = wrapper.findAll('td')

    // The first cell is the fund name, which is text and stays left-aligned.
    for (const cell of cells.slice(1)) {
      const classes = cell.classes().join(' ')
      expect(classes).toContain('tabular-nums')
      expect(classes).toContain('text-right')
    }
  })

  it('colours a loss as a loss while keeping the sign in the text', () => {
    const wrapper = mount(FundPositionsTable, {
      props: { positions: [makePosition({ gain: -16000, value: 144000 })] },
    })

    const gainCell = wrapper.get('[data-testid="position-gain"]')
    expect(gainCell.text()).toBe('-160,00 €')
    expect(gainCell.classes()).toContain('text-destructive')
  })

  it('renders no table at all when there are no positions', () => {
    // The parent shows the empty state; an empty table with seven headers and
    // no rows says nothing useful.
    const wrapper = mount(FundPositionsTable, { props: { positions: [] } })

    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('keeps the order the API gave', () => {
    // `valuate` already sorts by value descending, and the interface does not
    // re-sort: two components disagreeing about order is a bug users see.
    const wrapper = mount(FundPositionsTable, {
      props: {
        positions: [
          makePosition({ fundId: 'world', name: 'Mundial', value: 176000 }),
          makePosition({ fundId: 'emerging', name: 'Emergentes', value: 44000 }),
        ],
      },
    })

    expect(wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text()))
      .toEqual(['Mundial', 'Emergentes'])
  })
})
