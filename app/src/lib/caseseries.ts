// Case-series and Matchmaker Exchange chance calculations.
//
// mu is the expected number of de novo variants of a chosen type in a gene (or gene
// set) per individual. In N sequenced individuals the chance count is Poisson(N * mu), so
//   P(>= k by chance) = ppoisUpper(k, N * mu)
//   individuals needed for probability q of >= k = qgamma(q, k) / mu
// because P(Poisson(lambda) >= k) = P(Gamma(k, 1) <= lambda).

import { qgamma } from './poisson'
import type { Consequence, GeneRates, Sites } from './model'

export type CaseConsequence = 'mis' | 'lof' | 'both'

export const CASE_CONSEQUENCE_LABELS: Record<CaseConsequence, string> = {
  mis: 'missense', lof: 'loss-of-function', both: 'missense or LoF',
}

// Matchmaker Exchange node counts, copied by hand from the statistics page ("Patients/Cases
// in MME" column). The MME API (github.com/ga4gh/mme-apis) is an authenticated
// patient-matching protocol with no statistics endpoint, so these cannot be fetched live.
// Update date and nodes together.
export const MME = {
  date: 'May 2026',
  url: 'https://www.matchmakerexchange.org/statistics.html',
  nodes: [
    { name: 'GeneMatcher', cases: 109_794 },
    { name: 'DECIPHER', cases: 52_543 },
    { name: 'PhenomeCentral', cases: 12_369 },
    { name: 'RD-Connect GPAP', cases: 8_726 },
    { name: 'MyGene2', cases: 2_444 },
    { name: 'Broad seqr', cases: 1_746 },
    { name: 'IRUD', cases: 62 },
    { name: 'PatientMatcher', cases: 48 },
    { name: 'BCH seqr', cases: 27 },
  ],
}
export const MME_CASES = MME.nodes.reduce((s, n) => s + n.cases, 0)

// summed roulette rate for one gene and variant type (multiply by the per-individual scale)
export function geneRate(g: GeneRates, sites: Sites, lof: Consequence[], cons: CaseConsequence): number {
  const r = g[sites]
  const mis = r.missense
  const l = lof.reduce((s, c) => s + r[c], 0)
  return cons === 'mis' ? mis : cons === 'lof' ? l : mis + l
}

export function individualsNeeded(k: number, mu: number, q: number): number {
  return qgamma(q, k) / mu
}

// Expected matchmaking cases in a gene set by chance if each case were a random
// individual: cases x the per-individual chance de novo rate in the set. This treats the
// network as a cohort of that many people; submitters pick people who already have a
// candidate variant, so the true chance count can be higher.
export function chanceMatches(ratePerIndividual: number, cases: number): number {
  return cases * ratePerIndividual
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
