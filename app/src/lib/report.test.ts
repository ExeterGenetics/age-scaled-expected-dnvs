import { describe, expect, it } from 'vitest'
import { num, toDelimited } from './report'

describe('report export', () => {
  const rows = [{ section: 'Inputs', field: 'Genes', value: 'ARID1B, SCN2A' }, { section: 'Result', field: 'Note', value: 'a "quoted"\ttab' }]

  it('quotes CSV cells with commas or quotes', () => {
    expect(toDelimited(rows, 'csv')).toBe('section,field,value\nInputs,Genes,"ARID1B, SCN2A"\nResult,Note,"a ""quoted""\ttab"\n')
  })

  it('keeps TSV one line per row', () => {
    expect(toDelimited(rows, 'tsv').split('\n')[2]).toBe('Result\tNote\ta "quoted" tab')
  })

  it('formats numbers to 4 significant figures', () => {
    expect(num(0.91873)).toBe('0.9187')
    expect(num(1.234e-7)).toBe('1.234e-7')
    expect(num(66123)).toBe('66120')
  })
})
