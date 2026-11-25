// Source tables, inlined at build time so the built page needs no server.
import geneRatesTsv from '../../../gene_rates.tsv?raw'
import scalingTsv from '../../../data/scaling_factors_pat_only.tsv?raw'
import geneSetsJson from '../../../gene_sets/gene_sets.json'
import missenseBinsTsv from '../../../missense_score_bins.tsv?raw'
import { parseGeneRates, parseScalingFactors } from '../lib/parse'
import type { GeneSetsFile } from '../lib/genesets'
import { parseMissenseBins } from '../lib/missense'
import type { PerBin } from '../lib/model'

export const GENE_RATES = parseGeneRates(geneRatesTsv)
// missense rate per gene binned by AlphaMissense and REVEL score, from build_missense_scores.py
export const MISSENSE_BINS = parseMissenseBins(missenseBinsTsv)
export const K_BY_BACKGROUND = parseScalingFactors(scalingTsv)
// pre-built gene sets and the alias map, from build_gene_sets.py
export const GENE_SETS = geneSetsJson as GeneSetsFile
// protein-coding genes on X, Y or MT: no rates, named as such when not found
export const NON_AUTOSOMAL: Record<string, string> = GENE_SETS.non_autosomal ?? {}
// upper-case symbol -> gene_rates symbol, for matching custom gene lists
export const RATE_GENE_INDEX = new Map(GENE_RATES.map(g => [g.gene.toUpperCase(), g.gene]))

// deCODE probands per paternal-age bin, the denominators that turn each k (a cohort
// total) into a per-individual rate. Editable in the UI.
export const DEFAULT_N_DECODE: PerBin = {
  lt_25: 1153, '25_29': 1528, '30_34': 1391, '35_39': 808, gt_39: 518,
}

// Exact mean paternal age at birth within each deCODE paternal-age bin, from
// Pálsson et al. 2025 proband.info.tsv (n = 5,420 probands; overall mean 30.34 yr).
export const DECODE_BIN_MEAN_AGE: PerBin = {
  lt_25: 22.118002, '25_29': 27.061318, '30_34': 31.867384, '35_39': 36.683107, gt_39: 44.415385,
}

// Exact integer-year paternal-age counts in Pálsson et al. 2025 proband.info.tsv (n = 5,420,
// ages 16..71) for plotting where a user's cohort sits on the calibration distribution.
export const DECODE_AGE_MIN = 16
export const DECODE_AGE_HIST: readonly number[] = [
  1, 3, 37, 55, 112, 149, 263, 238, 303, 248, 345, 282, 381, 277, 348, 261, 286, 228, 272, 200,
  216, 133, 165, 97, 118, 75, 55, 45, 31, 40, 23, 25, 17, 19, 7, 14, 9, 7, 11, 4, 4, 4, 1, 2, 3,
  0, 3, 0, 1, 0, 1, 0, 0, 0, 0, 1,
]

// Versions of every data source, for About and exported reports. Update with the data.
export const DATA_VERSIONS: [string, string][] = [
  ['Mutation rates', 'Roulette (Seplyarskiy et al. 2023), MANE Select coding sites, GRCh38'],
  ['Calibration', 'deCODE trios by paternal age group (Pálsson et al. 2025)'],
  ['AlphaMissense', 'Cheng et al. 2023, AlphaMissense_hg38 (zenodo.org/records/8208688)'],
  ['REVEL', 'v1.3 (Ioannidis et al. 2016)'],
  ['Gene symbols and chromosomes', 'HGNC complete set, retrieved 2026-10-29'],
  ...GENE_SETS.sets.map(s => [s.label, s.source] as [string, string]),
  ['Gene sets built', GENE_SETS.built],
]
