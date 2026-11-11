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
// total) into a per-individual rate. These are not in scaling_factors_pat_only.tsv
// and could not be recomputed here (the dnm_input_file_* tables carry no proband
// IDs). They imply 55, 64, 72, 82 and 95 DNMs per proband across the bins, a smooth
// paternal-age gradient. Editable in the UI.
export const DEFAULT_N_DECODE: PerBin = {
  lt_25: 1153, '25_29': 1528, '30_34': 1391, '35_39': 808, gt_39: 518,
}

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
