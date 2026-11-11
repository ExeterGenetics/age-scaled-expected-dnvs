import { describe, expect, it } from 'vitest'
import { applyMissenseFilter, binIndex, filterShares, parseMissenseBins, poorlyScoredGenes, rateAtOrAbove } from './missense'
import type { GeneRates } from './model'

const cols = (p: string) => [...Array.from({ length: 20 }, (_, i) => `${p}_${i}`), `${p}_u`]
const header = ['gene', 'score', ...cols('hq'), ...cols('all')].join('\t')
// bins 0..19 = 1..20 milli-MR each, unscored = 100; 'all' doubles everything
const hq = [...Array.from({ length: 20 }, (_, i) => i + 1), 100]
const row = (gene: string, score: string) => [gene, score, ...hq, ...hq.map(v => 2 * v)].join('\t')
const bins = parseMissenseBins([header, row('G1', 'am'), row('G1', 'revel')].join('\n'))

describe('missense score bins', () => {
  it('maps grid thresholds to bins', () => {
    expect(binIndex(0)).toBe(0)
    expect(binIndex(0.55)).toBe(11)
    expect(binIndex(0.95)).toBe(19)
  })

  it('sums bins at or above the threshold and drops unscored sites', () => {
    const b = bins.am.get('G1')!.hq
    expect(rateAtOrAbove(b, 0)).toBeCloseTo(0.21, 10)      // sum 1..20 = 210 milli
    expect(rateAtOrAbove(b, 0.95)).toBeCloseTo(0.02, 10)
    expect(rateAtOrAbove(b, 0.5)).toBeCloseTo(0.155, 10)   // 11..20
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
})
