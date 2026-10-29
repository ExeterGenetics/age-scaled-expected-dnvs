// Source tables, inlined at build time so the built page needs no server.
import geneRatesTsv from '../../../gene_rates.tsv?raw'
import scalingTsv from '../../../data/scaling_factors_pat_only.tsv?raw'
import geneSetsJson from '../../../gene_sets/gene_sets.json'
import { parseGeneRates, parseScalingFactors } from '../lib/parse'
import type { GeneSetsFile } from '../lib/genesets'
import type { PerBin } from '../lib/model'

export const GENE_RATES = parseGeneRates(geneRatesTsv)
export const K_BY_BACKGROUND = parseScalingFactors(scalingTsv)
// pre-built gene sets and the alias map, from build_gene_sets.py
export const GENE_SETS = geneSetsJson as GeneSetsFile
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
