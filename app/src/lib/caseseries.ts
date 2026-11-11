// Case-series and GeneMatcher chance calculations.
//
// mu is the expected number of de novo variants of a chosen type in a gene (or gene
// set) per child. In N sequenced children the chance count is Poisson(N * mu), so
//   P(>= k by chance) = ppoisUpper(k, N * mu)
//   children needed for probability q of >= k = qgamma(q, k) / mu
// because P(Poisson(lambda) >= k) = P(Gamma(k, 1) <= lambda).

import { qgamma } from './poisson'
import type { Consequence, GeneRates, Sites } from './model'

export type CaseConsequence = 'mis' | 'lof' | 'both'

export const CASE_CONSEQUENCE_LABELS: Record<CaseConsequence, string> = {
  mis: 'missense', lof: 'loss-of-function', both: 'missense or LoF',
}

// GeneMatcher has no public API and its statistics page refuses automated requests,
// so the human submission count is copied by hand. Update both fields together.
export const GENEMATCHER = {
  date: '11 November 2026',
  humanSubmissions: 118_780,
  url: 'https://genematcher.org/statistics/',
}

// summed roulette rate for one gene and variant type (multiply by the per-child scale)
export function geneRate(g: GeneRates, sites: Sites, lof: Consequence[], cons: CaseConsequence): number {
  const r = g[sites]
  const mis = r.missense
  const l = lof.reduce((s, c) => s + r[c], 0)
  return cons === 'mis' ? mis : cons === 'lof' ? l : mis + l
}

export function childrenNeeded(k: number, mu: number, q: number): number {
  return qgamma(q, k) / mu
}

// Expected GeneMatcher submissions in a gene set if each submission were a random
// protein-altering de novo variant: submissions x the set's share of the exome-wide
// missense + LoF rate.
export function chanceSubmissions(setRate: number, exomeRate: number, submissions: number): number {
  return submissions * setRate / exomeRate
}

// fraction of values strictly below v; values must be sorted ascending
export function percentileBelow(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m }
  return lo / sorted.length
}

export function median(sorted: number[]): number {
  const n = sorted.length
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}
