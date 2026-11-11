// Missense score filter. missense_score_bins.tsv (build_missense_scores.py) holds, per
// gene and score, the missense roulette rate binned at score edges (the 0.05 grid plus the
// published cutoffs) plus an unscored bin, in units of 0.001 MR, for high-quality and all
// sites. Columns are named by each bin's lower edge (hq_0.5641), so the edges are read from
// the header. The rate with score >= an edge is the sum of the bins from that edge up;
// unscored sites never pass.

import type { GeneRates, Sites } from './model'

export const MISSENSE_SCORES = {
  am: 'AlphaMissense',
  revel: 'REVEL',
} as const
export type MissenseScore = keyof typeof MISSENSE_SCORES


// Published cutoffs, offered as one-click thresholds. Each must be a bin edge in the TSV.
// AlphaMissense (Cheng et al. 2023): likely benign < 0.34, likely pathogenic > 0.564; scores
// have 4 decimals, so "> 0.564" is ">= 0.5641". REVEL: ClinGen PP3 (Pejaver et al. 2022).
export interface Cutoff { t: number; label: string; name: string }
export const SCORE_CUTOFFS: Record<MissenseScore, Cutoff[]> = {
  am: [
    { t: 0.34, label: '≥ 0.34', name: 'not likely benign' },
    { t: 0.5641, label: '> 0.564', name: 'likely pathogenic' },
  ],
  revel: [
    { t: 0.644, label: '≥ 0.644', name: 'PP3 supporting' },
    { t: 0.773, label: '≥ 0.773', name: 'PP3 moderate' },
    { t: 0.932, label: '≥ 0.932', name: 'PP3 strong' },
  ],
}
export const SCORE_CUTOFF_SOURCE: Record<MissenseScore, string> = {
  am: 'AlphaMissense classes (Cheng et al. 2023): likely benign < 0.34, likely pathogenic > 0.564.',
  revel: 'ClinGen PP3 cutoffs for REVEL (Pejaver et al. 2022): supporting ≥ 0.644, moderate ≥ 0.773, strong ≥ 0.932.',
}
// threshold used when a score is first chosen: its pathogenic cutoff
export const SCORE_DEFAULT_THRESHOLD: Record<MissenseScore, number> = { am: 0.5641, revel: 0.644 }

export interface MissenseFilter {
  score: MissenseScore | 'none'
  threshold: number  // a bin edge
}
export const NO_FILTER: MissenseFilter = { score: 'none', threshold: SCORE_DEFAULT_THRESHOLD.am }

// per gene: one value per bin (ascending edges), then unscored at index edges.length
export type ScoreBins = Record<Sites, number[]>
export type MissenseBins = { edges: number[] } & Record<MissenseScore, Map<string, ScoreBins>>

export function parseMissenseBins(text: string): MissenseBins {
  const [head, ...lines] = text.trim().split('\n')
  const cols = head.split('\t')
  const edgeNames = cols.filter(c => /^hq_\d/.test(c)).map(c => c.slice(3))
  const edges = edgeNames.map(Number)
  if (edges.length === 0 || edges[0] !== 0 || edges.some((e, i) => i > 0 && !(e > edges[i - 1]))) {
    throw new Error('missense_score_bins.tsv bin edges must start at 0 and increase')
  }
  const ix = (prefix: string) =>
    [...edgeNames.map(e => `${prefix}_${e}`), `${prefix}_u`].map(c => {
      const i = cols.indexOf(c)
      if (i < 0) throw new Error(`missense_score_bins.tsv is missing column ${c}`)
      return i
    })
  const hqIx = ix('hq'), allIx = ix('all')
  const scoreCol = cols.indexOf('score')
  const out: MissenseBins = { edges, am: new Map(), revel: new Map() }
  for (const line of lines) {
    const f = line.split('\t')
    const score = f[scoreCol] as MissenseScore
    if (!(score in MISSENSE_SCORES)) throw new Error(`unknown score ${score} in missense_score_bins.tsv`)
    out[score].set(f[0], { hq: hqIx.map(i => Number(f[i]) / 1000), all: allIx.map(i => Number(f[i]) / 1000) })
  }
  return out
}

// index of the highest edge at or below the threshold
export function binIndex(edges: number[], threshold: number): number {
  let i = 0
  while (i + 1 < edges.length && edges[i + 1] <= threshold + 1e-9) i++
  return i
}

export function rateAtOrAbove(bins: number[], edges: number[], threshold: number): number {
  let s = 0
  for (let i = binIndex(edges, threshold); i < edges.length; i++) s += bins[i]
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
      hq: { ...g.hq, missense: b ? rateAtOrAbove(b.hq, bins.edges, f.threshold) : 0 },
      all: { ...g.all, missense: b ? rateAtOrAbove(b.all, bins.edges, f.threshold) : 0 },
    }
  })
}

// share of the missense rate over the given genes that has any score, and that passes
export function filterShares(
  genes: Iterable<string>, bins: MissenseBins, f: MissenseFilter, sites: Sites,
): { scored: number; passing: number } {
  if (f.score === 'none') return { scored: 1, passing: 1 }
  const n = bins.edges.length
  let scored = 0, passing = 0, total = 0
  for (const g of genes) {
    const b = bins[f.score].get(g)?.[sites]
    if (!b) continue
    for (let i = 0; i < n; i++) scored += b[i]
    total += b[n]
    passing += rateAtOrAbove(b, bins.edges, f.threshold)
  }
  total += scored
  return total > 0 ? { scored: scored / total, passing: passing / total } : { scored: 0, passing: 0 }
}

// the published cutoff at this threshold, if it is one
export function cutoffAt(score: MissenseScore, threshold: number): Cutoff | undefined {
  return SCORE_CUTOFFS[score].find(c => Math.abs(c.t - threshold) < 1e-9)
}

export function thresholdLabel(score: MissenseScore, threshold: number): string {
  return cutoffAt(score, threshold)?.label ?? `≥ ${threshold.toFixed(2)}`
}

export function filterLabel(f: MissenseFilter): string {
  return f.score === 'none' ? '' : `${MISSENSE_SCORES[f.score]} ${thresholdLabel(f.score, f.threshold)}`
}

const SHORT: Record<MissenseScore, string> = { am: 'AM', revel: 'REVEL' }
export function filterShortLabel(f: MissenseFilter): string {
  return f.score === 'none' ? '' : `${SHORT[f.score]} ${thresholdLabel(f.score, f.threshold)}`
}

// genes with missense sites but less than minShare of their missense rate scored: their
// filtered rate is mostly missing data rather than a low rate, so the UI flags them
export function poorlyScoredGenes(bins: MissenseBins, f: MissenseFilter, sites: Sites, minShare = 0.5): Set<string> {
  const out = new Set<string>()
  if (f.score === 'none') return out
  const n = bins.edges.length
  for (const [gene, b] of bins[f.score]) {
    const v = b[sites]
    let scored = 0
    for (let i = 0; i < n; i++) scored += v[i]
    const total = scored + v[n]
    if (total > 0 && scored < minShare * total) out.add(gene)
  }
  return out
}
