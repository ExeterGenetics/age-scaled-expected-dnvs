import { describe, expect, it } from 'vitest'
import { burden, classify, geneTests, parseDnvs, pbinomUpper, setBurden } from './denovo'
import { LOF_DEFAULT } from './model'
import type { GeneExpected } from './model'
import { NO_FILTER } from './missense'
import type { MissenseFilter } from './missense'
import { bgzfBlocks } from './gzip'

const resolve = (s: string) => ({ ARID1B: 'ARID1B', SCN2A: 'SCN2A', TTN: 'TTN', MLL2: 'KMT2D', KMT2D: 'KMT2D' } as Record<string, string>)[s.toUpperCase()]
const parse = (text: string, filter: MissenseFilter = NO_FILTER) => {
  const r = parseDnvs(text, LOF_DEFAULT, filter, resolve)
  if (!r || 'error' in r) throw new Error(r ? r.error : 'empty')
  return r
}

describe('classify', () => {
  it('maps VEP, bcftools and denovolyzeR terms', () => {
    expect(classify('missense_variant', LOF_DEFAULT)).toBe('mis')
    expect(classify('synonymous_variant', LOF_DEFAULT)).toBe('syn')
    expect(classify('stop_gained&splice_region_variant', LOF_DEFAULT)).toBe('lof')
    expect(classify('*missense&splice_region', LOF_DEFAULT)).toBe('mis')
    expect(classify('non', LOF_DEFAULT)).toBe('lof')
    expect(classify('splice', LOF_DEFAULT)).toBe('lof')
    expect(classify('frameshift_variant', LOF_DEFAULT)).toBe('notSnv')
    expect(classify('frameshift', LOF_DEFAULT)).toBe('notSnv')
    expect(classify('splice_region_variant', LOF_DEFAULT)).toBe('otherConsequence')
  })

  it('respects the selected LoF classes', () => {
    expect(classify('start_lost', LOF_DEFAULT)).toBe('lofNotSelected')
    expect(classify('start_lost', [...LOF_DEFAULT, 'start_lost'])).toBe('lof')
    // its site's rate sits under start_lost, so it is in neither expectation
    expect(classify('start_lost&missense_variant', LOF_DEFAULT)).toBe('lofNotSelected')
  })
})

describe('parseDnvs', () => {
  it('reads a headed TSV, resolves aliases and counts skips', () => {
    const text = 'gene\tconsequence\nARID1B\tstop_gained\nARID1B\tmissense_variant\nMLL2\tmissense_variant\nFOO1\tmissense_variant\nSCN2A\tframeshift_variant\n'
    const p = parse(text)
    expect(p.format).toBe('list')
    expect(p.rows).toBe(5)
    expect(p.counted).toBe(3)
    expect(p.byGene.get('ARID1B')).toEqual({ syn: 0, mis: 1, lof: 1 })
    expect(p.byGene.get('KMT2D')).toEqual({ syn: 0, mis: 1, lof: 0 })
    expect(p.renamed).toEqual([['MLL2', 'KMT2D']])
    expect(p.unknownGenes).toEqual(['FOO1'])
    expect(p.skipped.notSnv).toBe(1)
  })

  it('reads headerless whitespace input in either column order', () => {
    expect(parse('ARID1B missense\nTTN syn').counted).toBe(2)
    expect(parse('consequence,symbol\nnon,ARID1B').byGene.get('ARID1B')!.lof).toBe(1)
  })

  it('applies the missense score filter when a matching column is present', () => {
    const text = 'gene\tcsq\tREVEL_rankscore\tREVEL\nARID1B\tmissense\t0.1\t0.9\nARID1B\tmissense\t0.99\t0.3\nARID1B\tmissense\t.\t.\nARID1B\tstop_gained\t.\t.'
    const p = parse(text, { score: 'revel', threshold: 0.644 })
    expect(p.byGene.get('ARID1B')).toEqual({ syn: 0, mis: 1, lof: 1 })
    expect(p.skipped.belowScore).toBe(1)
    expect(p.skipped.noScore).toBe(1)
    expect(p.scoreField).toBe('REVEL')
  })

  it('reads counts per gene, headed or bare', () => {
    const h = parse('gene\tN_syn\tN_mis\tN_lof\nARID1B\t1\t2\t3\nFOO1\t0\t1\t0')
    expect(h.format).toBe('counts')
    expect(h.byGene.get('ARID1B')).toEqual({ syn: 1, mis: 2, lof: 3 })
    expect(h.counted).toBe(6)
    expect(h.skipped.unknownGene).toBe(1)
    expect(parse('ARID1B 0 4 1\nTTN 2 0 0').byGene.get('ARID1B')).toEqual({ syn: 0, mis: 4, lof: 1 })
    expect(parse('symbol,lof\nSCN2A,2').byGene.get('SCN2A')).toEqual({ syn: 0, mis: 0, lof: 2 })
  })

  it('weights list rows by an optional count column', () => {
    const p = parse('gene\tconsequence\tn\nARID1B\tstop_gained\t3\nSCN2A\tmissense_variant\t\nTTN\tmissense\t0\nTTN\tmissense\t1.5')
    expect(p.byGene.get('ARID1B')!.lof).toBe(3)
    expect(p.byGene.get('SCN2A')!.mis).toBe(1)      // blank count = 1
    expect(p.byGene.has('TTN')).toBe(false)         // 0 adds nothing; 1.5 is refused
    expect(p.skipped.badCount).toBe(1)
    expect(p.counted).toBe(4)
  })

  it('keeps a list with a LoF flag column a list', () => {
    const p = parse('SYMBOL\tConsequence\tLoF\nARID1B\tstop_gained\tHC\nTTN\tmissense_variant\t')
    expect(p.format).toBe('list')
    expect(p.byGene.get('ARID1B')!.lof).toBe(1)
    expect(p.byGene.get('TTN')!.mis).toBe(1)
  })

  it('prefers a symbol column over Ensembl gene IDs and keeps empty first cells', () => {
    const p = parse('Gene\tSYMBOL\tConsequence\nENSG00000049618\tARID1B\tstop_gained')
    expect(p.byGene.get('ARID1B')!.lof).toBe(1)
    const q = parse('sample\tgene\tconsequence\n\tSCN2A\tmissense_variant\nS2\tTTN\tsynonymous_variant')
    expect(q.byGene.get('SCN2A')!.mis).toBe(1)
    expect(q.counted).toBe(2)
  })

  it('finds a #-prefixed header after comment lines', () => {
    const p = parse('# exported by pipeline\n#chrom\tpos\tgene\tconsequence\n6\t1\tARID1B\tstop_gained')
    expect(p.byGene.get('ARID1B')!.lof).toBe(1)
  })

  it('accepts a #-prefixed header and refuses VCFs', () => {
    const p = parse('#gene\tconsequence\n# a comment\nARID1B\tstop_gained')
    expect(p.rows).toBe(1)
    expect(p.byGene.get('ARID1B')!.lof).toBe(1)
    const v = parseDnvs('##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\n6\t1\t.\tC\tT', LOF_DEFAULT, NO_FILTER, resolve)
    expect(v && 'error' in v).toBe(true)
  })
})

describe('gene-set burden', () => {
  it('computes binomial upper tails', () => {
    expect(pbinomUpper(0, 5, 0.3)).toBe(1)
    expect(pbinomUpper(5, 5, 0.5)).toBeCloseTo(1 / 32, 12)
    expect(pbinomUpper(2, 3, 0.5)).toBeCloseTo(0.5, 12)
  })

  it('splits burden inside and outside a set and tests the difference', () => {
    const exp: GeneExpected[] = [
      { gene: 'ARID1B', chrom: '6', syn: 0.5, mis: 1, lof: 0.1 },
      { gene: 'TTN', chrom: '2', syn: 2, mis: 4, lof: 0.2 },
      { gene: 'SCN2A', chrom: '2', syn: 0.5, mis: 1, lof: 0.1 },
    ]
    const p = parse('ARID1B stop_gained\nARID1B stop_gained\nTTN stop_gained\nTTN missense')
    const c = setBurden(p, exp, null, new Set(['ARID1B', 'SCN2A']))
    expect(c.nInside).toBe(2)
    expect(c.nOutside).toBe(1)
    expect(c.inside.lof!.observed).toBe(2)
    expect(c.inside.lof!.expected).toBeCloseTo(0.2, 12)
    expect(c.outside.lof!.observed).toBe(1)
    expect(c.ratio.lof).toBeCloseTo((2 / 0.2) / (1 / 0.2), 12)
    // 3 LoF in all, half the expectation in the set: P(>= 2 of 3 | 0.5) = 0.5
    expect(c.p.lof).toBeCloseTo(0.5, 12)
    // the scope restricts both sides
    expect(setBurden(p, exp, new Set(['ARID1B', 'TTN']), new Set(['ARID1B'])).nOutside).toBe(1)
  })
})

describe('bgzfBlocks', () => {
  it('splits BGZF blocks by their size field and rejects plain gzip', () => {
    // two minimal BGZF headers: BSIZE = total block length - 1
    const block = (len: number) => {
      const b = new Uint8Array(len)
      b.set([0x1f, 0x8b, 8, 4, 0, 0, 0, 0, 0, 0xff, 6, 0, 66, 67, 2, 0, (len - 1) & 0xff, (len - 1) >> 8])
      return b
    }
    const two = new Uint8Array([...block(28), ...block(40)])
    expect(bgzfBlocks(two)).toEqual([[0, 28], [28, 68]])
    expect(bgzfBlocks(new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
})

const EXP: GeneExpected[] = [
  { gene: 'ARID1B', chrom: '6', syn: 0.5, mis: 1, lof: 0.1 },
  { gene: 'TTN', chrom: '2', syn: 2, mis: 4, lof: 0.2 },
  { gene: 'SCN2A', chrom: '2', syn: 0.5, mis: 1, lof: 0.1 },
]

describe('burden and gene tests', () => {
  const p = parse('ARID1B stop_gained\nARID1B stop_gained\nARID1B missense\nTTN synonymous\nTTN missense')

  it('sums observed and expected per class within scope', () => {
    const b = burden(p, EXP, null)
    expect(b.lof!.observed).toBe(2)
    expect(b.lof!.expected).toBeCloseTo(0.4, 10)
    expect(b.prot!.observed).toBe(4)
    expect(b.prot!.expected).toBeCloseTo(6.4, 10)
    expect(b.syn!.observed).toBe(1)
    const s = burden(p, EXP, new Set(['ARID1B', 'SCN2A']))
    expect(s.lof!.expected).toBeCloseTo(0.2, 10)
    expect(s.outOfScope).toBe(2)
  })

  it('tests genes with protein-altering de novos and sets a Bonferroni threshold', () => {
    const r = geneTests(p, EXP, null)
    expect(r.nGenes).toBe(3)
    expect(r.threshold).toBeCloseTo(0.05 / 6, 12)
    expect(r.genes.map(g => g.gene)).toEqual(['ARID1B', 'TTN'])
    // P(X >= 2 | 0.1) = 1 - e^-0.1 (1 + 0.1)
    expect(r.genes[0].pLof!).toBeCloseTo(1 - Math.exp(-0.1) * 1.1, 10)
    expect(r.genes[0].significant).toBe(true)
  })
})
