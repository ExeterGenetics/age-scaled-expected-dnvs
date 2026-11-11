// A cohort (paternal ages) and model settings with the expected counts they give per gene.
// The Calculator and the de novo test tab each hold their own, so the tabs are independent.

import { useMemo, useState } from 'react'
import { DEFAULT_N_DECODE, GENE_RATES, K_BY_BACKGROUND, MISSENSE_BINS } from './data/sources'
import { applyMissenseFilter, NO_FILTER } from './lib/missense'
import type { MissenseFilter } from './lib/missense'
import { BIN_LABELS, BINS, cohortScale, countsFromAges, countsFromNormal, expectedPerGene, LOF_DEFAULT } from './lib/model'
import type { Background, Consequence, GeneExpected, GeneRates, PerBin, Sites } from './lib/model'
import { readAges } from './lib/parse'
import type { NormalState, TsvState } from './components/AgeInputs'

export type Mode = 'tsv' | 'normal'
export type Cohort = { counts: PerBin; n: number; description: string } | { error: string }

export function resolveCohort(mode: Mode, ages: number[] | null, normal: NormalState): Cohort {
  if (mode === 'tsv') {
    if (!ages || ages.length === 0) return { error: 'Load a file or paste paternal ages to begin.' }
    return { counts: countsFromAges(ages), n: ages.length, description: `${ages.length} paternal ages from TSV` }
  }
  const mean = parseFloat(normal.mean), sd = parseFloat(normal.sd), n = parseFloat(normal.n)
  if (!Number.isFinite(mean)) return { error: 'Enter a mean paternal age.' }
  if (!(sd > 0)) return { error: 'Enter an SD above zero.' }
  if (!(n > 0)) return { error: 'Enter the number of individuals.' }
  return { counts: countsFromNormal(mean, sd, n), n, description: `normal(mean ${mean}, SD ${sd}), n = ${n}` }
}

// active: compute the per-gene expectations only while a tab using them is open
// initial: starting settings, e.g. from a shared link
export function useCohortModel(
  active = true,
  initial: Partial<{ missense: MissenseFilter; lof: Consequence[]; sites: Sites; background: Background }> = {},
) {
  const [mode, setMode] = useState<Mode>('normal')
  const [tsv, setTsv] = useState<TsvState>({ table: null, column: 0, text: '', fileName: null })
  const [normal, setNormal] = useState<NormalState>({ mean: '33', sd: '5.5', n: '1000' })
  const [background, setBackground] = useState<Background>(initial.background ?? 'k_intergenic')
  const [sites, setSites] = useState<Sites>(initial.sites ?? 'hq')
  const [lof, setLof] = useState<Consequence[]>(initial.lof ?? LOF_DEFAULT)
  const [nDecode, setNDecode] = useState<PerBin>(DEFAULT_N_DECODE)
  const [missense, setMissense] = useState<MissenseFilter>(initial.missense ?? NO_FILTER)

  // gene rates with missense restricted to sites passing the score filter
  const rates: GeneRates[] = useMemo(
    () => (active ? applyMissenseFilter(GENE_RATES, MISSENSE_BINS, missense) : GENE_RATES), [active, missense],
  )
  const ageSummary = useMemo(() => (tsv.table ? readAges(tsv.table, tsv.column) : null), [tsv.table, tsv.column])
  const cohort = useMemo(() => resolveCohort(mode, ageSummary?.ages ?? null, normal), [mode, ageSummary, normal])
  const k = K_BY_BACKGROUND[background]
  const badN = BINS.filter(b => !(nDecode[b] > 0))
  const nDecodeError = badN.length ? `deCODE proband counts must be above zero (${badN.map(b => BIN_LABELS[b]).join(', ')}).` : null
  const error = 'error' in cohort ? cohort.error : nDecodeError
  // expected counts per gene for the cohort, all genes; empty when the inputs are invalid
  const rows: GeneExpected[] = useMemo(() => {
    if (!active || error || 'error' in cohort) return []
    return expectedPerGene(rates, cohortScale(cohort.counts, k, nDecode), sites, lof)
  }, [active, error, cohort, k, nDecode, sites, lof, rates])

  return {
    mode, setMode, tsv, setTsv, normal, setNormal, background, setBackground, sites, setSites,
    lof, setLof, nDecode, setNDecode, missense, setMissense,
    rates, ageSummary, cohort, k, nDecodeError, error, rows,
  }
}
export type CohortModel = ReturnType<typeof useCohortModel>
