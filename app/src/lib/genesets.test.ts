import { describe, expect, it } from 'vitest'
import { describeOffAutosome, parseGeneList, resolveGeneList, splitUnmatched } from './genesets'

describe('custom gene lists', () => {
  const rates = new Map([['SCN2A', 'SCN2A'], ['KMT2D', 'KMT2D'], ['TTN', 'TTN']])
  const aliases = { MLL2: 'KMT2D' }

  it('splits on newlines, commas, semicolons and tabs, dropping a header', () => {
    expect(parseGeneList('gene\tscore\nSCN2A\t1\nKMT2D, TTN; "ARID1B"\n\n'))
      .toEqual(['SCN2A', 'KMT2D', 'TTN', 'ARID1B'])
  })

  it('matches case-insensitively, resolves previous symbols and reports the rest', () => {
    const r = resolveGeneList(['scn2a', 'MLL2', 'KMT2D', 'NOTAGENE', 'NOTAGENE'], rates, aliases)
    expect(r.genes).toEqual(['SCN2A', 'KMT2D'])
    expect(r.renamed).toEqual([['MLL2', 'KMT2D']])
    expect(r.duplicates).toBe(1)
    expect(r.unmatched).toEqual(['NOTAGENE'])
  })
})

describe('unmatched symbols', () => {
  it('names genes off the autosomes separately from unknown symbols', () => {
    const r = splitUnmatched(['DDX3X', 'foo1', 'sry'], { DDX3X: 'X', SRY: 'Y' })
    expect(r.offAutosome).toEqual([['DDX3X', 'X'], ['sry', 'Y']])
    expect(r.unknown).toEqual(['foo1'])
    expect(describeOffAutosome(r.offAutosome, 1)).toBe('DDX3X (X) +1 more')
  })
})
