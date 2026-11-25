// Expected de novo SNV counts per gene, scaled continuously by paternal age.
//
// For each deCODE paternal-age bin b, s_b = k_b / N_deCODE_b is the observed
// expected DNMs per individual per unit of Roulette rate, paired with the bin's
// exact mean paternal age a_b (Pálsson et al. 2025 proband.info.tsv).
// An N_deCODE_b-weighted linear regression fits s(a) = alpha + beta * a (R^2 = 0.9987
// for the intergenic background), preserving the exact overall deCODE calibration
// mean while eliminating open-ended tail clamping (<25, >=40). By linearity of
// expectation, a cohort of N individuals with mean paternal age meanAge has
//
//   E = sum(roulette MR over the gene's sites) * N * (alpha + beta * meanAge)
//
// regardless of the cohort's SD or skewness.

export const BINS = ['lt_25', '25_29', '30_34', '35_39', 'gt_39'] as const
export type Bin = (typeof BINS)[number]
export const BIN_LABELS: Record<Bin, string> = {
  lt_25: '<25', '25_29': '25–29', '30_34': '30–34', '35_39': '35–39', gt_39: '≥40',
}
// lower edge of every bin after the first; ages are compared as exact numbers
export const BIN_EDGES = [25, 30, 35, 40]

// most severe first, matching the column order of gene_rates.tsv
export const CONSEQUENCES = [
  'splice_acceptor', 'splice_donor', 'stop_gained', 'start_lost', 'stop_lost',
  'missense', 'synonymous',
] as const
export type Consequence = (typeof CONSEQUENCES)[number]
export const LOF_OPTIONS: Consequence[] = [
  'stop_gained', 'splice_donor', 'splice_acceptor', 'start_lost', 'stop_lost',
]
export const LOF_DEFAULT: Consequence[] = ['stop_gained', 'splice_donor', 'splice_acceptor']

export const BACKGROUNDS = {
  k_intergenic: 'Intergenic (between genes)',
  k_synonymous: 'Synonymous (protein unchanged)',
  k_all_coding: 'All coding',
} as const
export type Background = keyof typeof BACKGROUNDS

export type Sites = 'hq' | 'all'

export type PerBin = Record<Bin, number>

export interface GeneRates {
  gene: string
  chrom: string
  hq: Record<Consequence, number>
  all: Record<Consequence, number>
}

export interface GeneExpected {
  gene: string
  chrom: string
  syn: number
  mis: number
  lof: number
}

export function emptyPerBin(): PerBin {
  return { lt_25: 0, '25_29': 0, '30_34': 0, '35_39': 0, gt_39: 0 }
}

export function binOf(age: number): Bin {
  const i = BIN_EDGES.findIndex(edge => age < edge)
  return BINS[i === -1 ? BINS.length - 1 : i]
}

export function countsFromAges(ages: number[]): PerBin {
  const counts = emptyPerBin()
  for (const a of ages) counts[binOf(a)] += 1
  return counts
}

// Numerical Recipes erfc, |error| < 1.2e-7
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + z / 2)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 +
    t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
    t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2)
}

// Untruncated normal: the tails land in the open-ended <25 and >=40 bins.
export function countsFromNormal(mean: number, sd: number, n: number): PerBin {
  const counts = emptyPerBin()
  let prev = 0
  BINS.forEach((bin, i) => {
    const cdf = i < BIN_EDGES.length ? normCdf((BIN_EDGES[i] - mean) / sd) : 1
    counts[bin] = n * (cdf - prev)
    prev = cdf
  })
  return counts
}

export interface LinearFit {
  alpha: number    // intercept: expected DNMs per individual per unit MR at age 0
  beta: number     // slope: additional expected DNMs per individual per unit MR per year
  r2: number       // N_deCODE-weighted R^2 across the 5 calibration bins
  meanAge: number  // N_deCODE-weighted mean paternal age of deCODE calibration cohort
}

// N_deCODE-weighted ordinary least squares of s_b = k_b / N_deCODE_b on bin mean ages.
// Guaranteed to pass through the overall deCODE cohort mean (meanAge, sum k_b / sum N_b).
export function fitLinearRate(k: PerBin, nDecode: PerBin, binMeanAges: PerBin): LinearFit {
  const nTot = BINS.reduce((s, b) => s + nDecode[b], 0)
  const meanAge = BINS.reduce((s, b) => s + nDecode[b] * binMeanAges[b], 0) / nTot
  const meanS = BINS.reduce((s, b) => s + k[b], 0) / nTot
  let num = 0, den = 0
  for (const b of BINS) {
    const da = binMeanAges[b] - meanAge
    const sb = k[b] / nDecode[b]
    num += nDecode[b] * da * (sb - meanS)
    den += nDecode[b] * da * da
  }
  const beta = den > 0 ? num / den : 0
  const alpha = meanS - beta * meanAge
  let ssRes = 0, ssTot = 0
  for (const b of BINS) {
    const sb = k[b] / nDecode[b]
    const pred = alpha + beta * binMeanAges[b]
    ssRes += nDecode[b] * (sb - pred) ** 2
    ssTot += nDecode[b] * (sb - meanS) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
  return { alpha, beta, r2, meanAge }
}

// Expected DNMs per individual per unit of summed roulette rate at paternal age `age`.
export function rateAtAge(age: number, fit: LinearFit): number {
  return Math.max(0, fit.alpha + fit.beta * age)
}

// Expected DNMs in the whole cohort per unit of summed roulette rate under the linear model.
// Exact for any paternal-age distribution with mean `meanAge` and size `n`.
export function linearCohortScale(meanAge: number, n: number, fit: LinearFit): number {
  return n * rateAtAge(meanAge, fit)
}

// Expected DNMs in the whole cohort per unit of summed roulette rate (5-bin step model).
export function cohortScale(counts: PerBin, k: PerBin, nDecode: PerBin): number {
  return BINS.reduce((s, b) => s + counts[b] * k[b] / nDecode[b], 0)
}

export function expectedPerGene(
  genes: GeneRates[], scale: number, sites: Sites, lof: Consequence[],
): GeneExpected[] {
  return genes.map(g => {
    const mu = g[sites]
    return {
      gene: g.gene,
      chrom: g.chrom,
      syn: mu.synonymous * scale,
      mis: mu.missense * scale,
      lof: lof.reduce((s, c) => s + mu[c], 0) * scale,
    }
  })
}
