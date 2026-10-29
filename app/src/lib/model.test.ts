import { describe, expect, it } from 'vitest'
import {
  binOf, cohortScale, countsFromAges, countsFromNormal, expectedPerGene, LOF_DEFAULT, normCdf,
} from './model'
import type { GeneRates, PerBin } from './model'
import { parseScalingFactors, parseTable, pickAgeColumn, readAges } from './parse'

const ones: PerBin = { lt_25: 1, '25_29': 1, '30_34': 1, '35_39': 1, gt_39: 1 }

describe('binning', () => {
  it('uses exact ages against edges 25/30/35/40', () => {
    expect([24.9, 25, 29.9, 30, 39.99, 40, 70].map(binOf))
      .toEqual(['lt_25', '25_29', '25_29', '30_34', '35_39', 'gt_39', 'gt_39'])
  })

  it('counts individuals per bin', () => {
    expect(countsFromAges([24, 25, 29.9, 30, 40, 38]))
      .toEqual({ lt_25: 1, '25_29': 2, '30_34': 1, '35_39': 1, gt_39: 1 })
  })

  it('normal weights sum to n and are symmetric about the mean', () => {
    const c = countsFromNormal(32.5, 5, 1000)
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6)
    expect(c.lt_25).toBeCloseTo(c.gt_39, 4)
    expect(c['25_29']).toBeCloseTo(c['35_39'], 4)
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6)
  })
})

describe('expected counts', () => {
  const gene: GeneRates = {
    gene: 'G', chrom: '1',
    hq: { splice_acceptor: 1, splice_donor: 2, stop_gained: 3, start_lost: 4, stop_lost: 5, missense: 100, synonymous: 50 },
    all: { splice_acceptor: 1, splice_donor: 2, stop_gained: 3, start_lost: 4, stop_lost: 5, missense: 110, synonymous: 55 },
  }

  it('scales summed MR by sum_b n_b * k_b / N_b', () => {
    const k: PerBin = { lt_25: 10, '25_29': 20, '30_34': 30, '35_39': 40, gt_39: 50 }
    const n: PerBin = { lt_25: 10, '25_29': 10, '30_34': 10, '35_39': 10, gt_39: 10 }
    expect(cohortScale(ones, k, n)).toBeCloseTo(15)
    const [e] = expectedPerGene([gene], 2, 'hq', LOF_DEFAULT)
    expect(e).toEqual({ gene: 'G', chrom: '1', syn: 100, mis: 200, lof: 12 })
    expect(expectedPerGene([gene], 2, 'all', ['stop_gained'])[0].mis).toBe(220)
  })
})

describe('parsing', () => {
  it('finds the paternal age column and skips non-numeric values', () => {
    const t = parseTable('id\tmaternal_age\tpaternal_age\nA\t30\t31\nB\t28\tNA\nC\t29\t40')!
    expect(pickAgeColumn(t)).toBe(2)
    expect(readAges(t, 2)).toEqual({ ages: [31, 40], skipped: 1 })
  })

  it('reads headerless single-column input', () => {
    const t = parseTable('31\n28\n\n36\n')!
    expect(readAges(t, pickAgeColumn(t)).ages).toEqual([31, 28, 36])
  })

  it('maps scaling factor rows to bins by file name', () => {
    const k = parseScalingFactors([
      'input_file\tk_all_coding\tk_synonymous\tk_intergenic',
      '/x/dnm_input_file_pat_25_29.tsv\t2\t3\t4',
      '/x/dnm_input_file_pat_30_34.tsv\t5\t6\t7',
      '/x/dnm_input_file_pat_35_39.tsv\t8\t9\t10',
      '/x/dnm_input_file_pat_gt_39.tsv\t11\t12\t13',
      '/x/dnm_input_file_pat_lt_25.tsv\t1\t1.5\t1.7',
    ].join('\n'))
    expect(k.k_all_coding).toEqual({ lt_25: 1, '25_29': 2, '30_34': 5, '35_39': 8, gt_39: 11 })
    expect(k.k_intergenic.gt_39).toBe(13)
  })
})
