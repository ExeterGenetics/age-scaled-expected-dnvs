import { describe, expect, it } from 'vitest'
import { applyMissenseFilter, binIndex, filterLabel, filterShares, parseMissenseBins, poorlyScoredGenes, rateAtOrAbove } from './missense'
import type { GeneRates } from './model'

const GRID = Array.from({ length: 20 }, (_, i) => (i / 20).toFixed(4))
const cols = (p: string, edges = GRID) => [...edges.map(e => `${p}_${e}`), `${p}_u`]
const header = ['gene', 'score', ...cols('hq'), ...cols('all')].join('\t')
// bins 0..19 = 1..20 milli-MR each, unscored = 100; 'all' doubles everything
const hq = [...Array.from({ length: 20 }, (_, i) => i + 1), 100]
const row = (gene: string, score: string) => [gene, score, ...hq, ...hq.map(v => 2 * v)].join('\t')
const bins = parseMissenseBins([header, row('G1', 'am'), row('G1', 'revel')].join('\n'))

describe('missense score bins', () => {
  it('reads edges from the header and maps thresholds to bins', () => {
    expect(bins.edges).toHaveLength(20)
    expect(binIndex(bins.edges, 0)).toBe(0)
    expect(binIndex(bins.edges, 0.55)).toBe(11)
    expect(binIndex(bins.edges, 0.95)).toBe(19)
  })

  it('sums bins at or above the threshold and drops unscored sites', () => {
    const b = bins.am.get('G1')!.hq
    expect(rateAtOrAbove(b, bins.edges, 0)).toBeCloseTo(0.21, 10)      // sum 1..20 = 210 milli
    expect(rateAtOrAbove(b, bins.edges, 0.95)).toBeCloseTo(0.02, 10)
    expect(rateAtOrAbove(b, bins.edges, 0.5)).toBeCloseTo(0.155, 10)   // 11..20
  })

  it('replaces only missense, and zeroes genes with no binned sites', () => {
    const r = { synonymous: 1, missense: 9, stop_gained: 1, splice_donor: 0, splice_acceptor: 0, start_lost: 0, stop_lost: 0 }
    const genes: GeneRates[] = [{ gene: 'G1', chrom: '1', hq: r, all: r }, { gene: 'G2', chrom: '1', hq: r, all: r }]
    const out = applyMissenseFilter(genes, bins, { score: 'revel', threshold: 0.5 })
    expect(out[0].hq.missense).toBeCloseTo(0.155, 10)
    expect(out[0].all.missense).toBeCloseTo(0.31, 10)
    expect(out[0].hq.synonymous).toBe(1)
    expect(out[1].hq.missense).toBe(0)
    expect(applyMissenseFilter(genes, bins, { score: 'none', threshold: 0.5 })).toBe(genes)
  })

  it('reports scored and passing shares', () => {
    const s = filterShares(['G1'], bins, { score: 'am', threshold: 0.5 }, 'hq')
    expect(s.scored).toBeCloseTo(210 / 310, 10)
    expect(s.passing).toBeCloseTo(155 / 310, 10)
  })

  it('flags genes with under half their missense rate scored', () => {
    // G1: 210 of 310 scored; G2: nothing scored; G3: no missense sites at all
    const zero = Array(20).fill(0)
    const g2 = ['G2', 'am', ...zero, 50, ...zero, 50].join('\t')
    const g3 = ['G3', 'am', ...zero, 0, ...zero, 0].join('\t')
    const b = parseMissenseBins([header, row('G1', 'am'), g2, g3].join('\n'))
    expect([...poorlyScoredGenes(b, { score: 'am', threshold: 0.5 }, 'hq')]).toEqual(['G2'])
    expect([...poorlyScoredGenes(b, { score: 'am', threshold: 0.5 }, 'hq', 0.7)].sort()).toEqual(['G1', 'G2'])
    expect(poorlyScoredGenes(b, { score: 'none', threshold: 0.5 }, 'hq').size).toBe(0)
  })

  it('uses published cutoffs as exact edges', () => {
    // grid plus the AlphaMissense pathogenic edge 0.5641, between 0.55 and 0.60
    const edges = [...GRID.slice(0, 12), '0.5500', '0.5641', ...GRID.slice(12)].filter((e, i, a) => a.indexOf(e) === i)
    const vals = edges.map(() => 1)  // 1 milli-MR per bin
    const head = ['gene', 'score', ...cols('hq', edges), ...cols('all', edges)].join('\t')
    const line = ['G1', 'am', ...vals, 0, ...vals, 0].join('\t')
    const b = parseMissenseBins([head, line].join('\n'))
    expect(b.edges).toHaveLength(21)
    const hq = b.am.get('G1')!.hq
    expect(rateAtOrAbove(hq, b.edges, 0.5641)).toBeCloseTo(0.009, 10)  // 0.5641 + 8 grid bins 0.60..0.95
    expect(rateAtOrAbove(hq, b.edges, 0.55)).toBeCloseTo(0.010, 10)
    expect(filterLabel({ score: 'am', threshold: 0.5641 })).toBe('AlphaMissense > 0.564')
    expect(filterLabel({ score: 'revel', threshold: 0.6 })).toBe('REVEL ≥ 0.60')
  })
})
