// Missense score filter. missense_score_bins.tsv (build_missense_scores.py) holds, per
// gene and score, the missense roulette rate in 20 bins of width 0.05 plus an unscored
// bin, in units of 0.001 MR, for high-quality and all sites. The rate with score >= t
// (t on the 0.05 grid) is the sum of bins t*20..19; unscored sites never pass.

import type { GeneRates, Sites } from './model'

export const MISSENSE_SCORES = {
  am: 'AlphaMissense',
  revel: 'REVEL',
} as const
export type MissenseScore = keyof typeof MISSENSE_SCORES

export const NBINS = 20
export const SCORE_STEP = 1 / NBINS

// threshold suggested when a score is first chosen, and published calibrated cutoffs
export const SCORE_DEFAULT_THRESHOLD: Record<MissenseScore, number> = { am: 0.55, revel: 0.65 }
export const SCORE_CUTOFFS: Record<MissenseScore, string> = {
  am: 'AlphaMissense calls > 0.564 likely pathogenic and < 0.34 likely benign.',
  revel: 'ClinGen PP3 cutoffs for REVEL: supporting ≥ 0.644, moderate ≥ 0.773, strong ≥ 0.932.',
}

export interface MissenseFilter {
  score: MissenseScore | 'none'
  threshold: number  // multiple of SCORE_STEP in [0, 0.95]
}
export const NO_FILTER: MissenseFilter = { score: 'none', threshold: SCORE_DEFAULT_THRESHOLD.am }

// per gene: bins 0..19, then unscored at index NBINS, for each site set
export type ScoreBins = Record<Sites, number[]>
export type MissenseBins = Record<MissenseScore, Map<string, ScoreBins>>

export function parseMissenseBins(text: string): MissenseBins {
  const [head, ...lines] = text.trim().split('\n')
  const cols = head.split('\t')
  const ix = (prefix: string) =>
    [...Array.from({ length: NBINS }, (_, i) => `${prefix}_${i}`), `${prefix}_u`].map(c => {
      const i = cols.indexOf(c)
      if (i < 0) throw new Error(`missense_score_bins.tsv is missing column ${c}`)
      return i
    })
  const hqIx = ix('hq'), allIx = ix('all')
  const scoreCol = cols.indexOf('score')
  const out: MissenseBins = { am: new Map(), revel: new Map() }
  for (const line of lines) {
    const f = line.split('\t')
    const score = f[scoreCol] as MissenseScore
    if (!(score in out)) throw new Error(`unknown score ${score} in missense_score_bins.tsv`)
    out[score].set(f[0], { hq: hqIx.map(i => Number(f[i]) / 1000), all: allIx.map(i => Number(f[i]) / 1000) })
  }
  return out
}

export function binIndex(threshold: number): number {
  return Math.min(NBINS - 1, Math.max(0, Math.round(threshold * NBINS)))
}

export function rateAtOrAbove(bins: number[], threshold: number): number {
  let s = 0
  for (let i = binIndex(threshold); i < NBINS; i++) s += bins[i]
  return s
}

// Gene rates with missense replaced by the rate of missense sites passing the filter.
// Genes without binned sites have no missense sites, so get 0.
export function applyMissenseFilter(genes: GeneRates[], bins: MissenseBins, f: MissenseFilter): GeneRates[] {
  if (f.score === 'none') return genes
  const table = bins[f.score]
  return genes.map(g => {
    const b = table.get(g.gene)
    return {
      ...g,
      hq: { ...g.hq, missense: b ? rateAtOrAbove(b.hq, f.threshold) : 0 },
      all: { ...g.all, missense: b ? rateAtOrAbove(b.all, f.threshold) : 0 },
    }
  })
}

// share of the missense rate over the given genes that has any score, and that passes
export function filterShares(
  genes: Iterable<string>, bins: MissenseBins, f: MissenseFilter, sites: Sites,
): { scored: number; passing: number } {
  if (f.score === 'none') return { scored: 1, passing: 1 }
  let scored = 0, passing = 0, total = 0
  for (const g of genes) {
    const b = bins[f.score].get(g)?.[sites]
    if (!b) continue
    for (let i = 0; i < NBINS; i++) scored += b[i]
    total += b[NBINS]
    passing += rateAtOrAbove(b, f.threshold)
  }
  total += scored
  return total > 0 ? { scored: scored / total, passing: passing / total } : { scored: 0, passing: 0 }
}

export function filterLabel(f: MissenseFilter): string {
  return f.score === 'none' ? '' : `${MISSENSE_SCORES[f.score]} ≥ ${f.threshold.toFixed(2)}`
}

const SHORT: Record<MissenseScore, string> = { am: 'AM', revel: 'REVEL' }
export function filterShortLabel(f: MissenseFilter): string {
  return f.score === 'none' ? '' : `${SHORT[f.score]} ≥ ${f.threshold.toFixed(2)}`
}

// genes with missense sites but less than minShare of their missense rate scored: their
// filtered rate is mostly missing data rather than a low rate, so the UI flags them
export function poorlyScoredGenes(bins: MissenseBins, f: MissenseFilter, sites: Sites, minShare = 0.5): Set<string> {
  const out = new Set<string>()
  if (f.score === 'none') return out
  for (const [gene, b] of bins[f.score]) {
    const v = b[sites]
    let scored = 0
    for (let i = 0; i < NBINS; i++) scored += v[i]
    const total = scored + v[NBINS]
    if (total > 0 && scored < minShare * total) out.add(gene)
  }
  return out
}
