// A cohort (paternal ages) and model settings with the expected counts they give per gene.
// The Calculator and the de novo test tab each hold their own, so the tabs are independent.

import { useMemo, useState } from 'react'
import { DECODE_BIN_MEAN_AGE, DEFAULT_N_DECODE, GENE_RATES, K_BY_BACKGROUND, MISSENSE_BINS } from './data/sources'
import { applyMissenseFilter, NO_FILTER } from './lib/missense'
import type { MissenseFilter } from './lib/missense'
import {
  countsFromAges, expectedPerGene, fitLinearRate, linearCohortScale, LOF_DEFAULT,
} from './lib/model'
import type { Background, Consequence, GeneExpected, GeneRates, LinearFit, PerBin, Sites } from './lib/model'
import { readAges } from './lib/parse'
import type { MeanAgeState, TsvState } from './components/AgeInputs'

export type Mode = 'tsv' | 'mean'
export type Cohort = {
  meanAge: number
  counts: PerBin | null   // individual bin counts when ages come from TSV; null in mean-age mode
  n: number
  description: string
} | { error: string }

export function resolveCohort(mode: Mode, ages: number[] | null, meanInput: MeanAgeState): Cohort {
  if (mode === 'tsv') {
    if (!ages || ages.length === 0) return { error: 'Load a file or paste paternal ages to begin.' }
    const meanAge = ages.reduce((a, b) => a + b, 0) / ages.length
    return {
      meanAge,
      counts: countsFromAges(ages),
      n: ages.length,
      description: `${ages.length} paternal ages from TSV (mean ${meanAge.toFixed(2)} yr)`,
    }
  }
  const mean = parseFloat(meanInput.mean), n = parseFloat(meanInput.n)
  if (!Number.isFinite(mean) || mean <= 0) return { error: 'Enter a mean paternal age above zero.' }
  if (!(n > 0)) return { error: 'Enter the number of individuals.' }
  return {
    meanAge: mean,
    counts: null,
    n,
    description: `mean paternal age ${mean} yr, n = ${n}`,
  }
}

// active: compute the per-gene expectations only while a tab using them is open
// initial: starting settings, e.g. from a shared link
export function useCohortModel(
  active = true,
  initial: Partial<{ missense: MissenseFilter; lof: Consequence[]; sites: Sites; background: Background }> = {},
) {
  const [mode, setMode] = useState<Mode>('mean')
  const [tsv, setTsv] = useState<TsvState>({ table: null, column: 0, text: '', fileName: null })
  const [meanInput, setMeanInput] = useState<MeanAgeState>({ mean: '33', n: '1000' })
  const [background, setBackground] = useState<Background>(initial.background ?? 'k_intergenic')
  const [sites, setSites] = useState<Sites>(initial.sites ?? 'hq')
  const [lof, setLof] = useState<Consequence[]>(initial.lof ?? LOF_DEFAULT)
  const [missense, setMissense] = useState<MissenseFilter>(initial.missense ?? NO_FILTER)

  // gene rates with missense restricted to sites passing the score filter
  const rates: GeneRates[] = useMemo(
    () => (active ? applyMissenseFilter(GENE_RATES, MISSENSE_BINS, missense) : GENE_RATES), [active, missense],
  )
  const ageSummary = useMemo(() => (tsv.table ? readAges(tsv.table, tsv.column) : null), [tsv.table, tsv.column])
  const cohort = useMemo(() => resolveCohort(mode, ageSummary?.ages ?? null, meanInput), [mode, ageSummary, meanInput])
  const k = K_BY_BACKGROUND[background]
  const nDecode = DEFAULT_N_DECODE
  const error = 'error' in cohort ? cohort.error : null
  const linearFit: LinearFit = useMemo(
    () => fitLinearRate(k, nDecode, DECODE_BIN_MEAN_AGE),
    [k, nDecode],
  )
  // expected counts per gene for the cohort, all genes; empty when the inputs are invalid
  const rows: GeneExpected[] = useMemo(() => {
    if (!active || error || 'error' in cohort) return []
    return expectedPerGene(rates, linearCohortScale(cohort.meanAge, cohort.n, linearFit), sites, lof)
  }, [active, error, linearFit, cohort, sites, lof, rates])

  return {
    mode, setMode, tsv, setTsv, meanInput, setMeanInput, background, setBackground, sites, setSites,
    lof, setLof, nDecode, missense, setMissense,
    rates, ageSummary, cohort, k, linearFit, error, rows,
  }
}
export type CohortModel = ReturnType<typeof useCohortModel>
