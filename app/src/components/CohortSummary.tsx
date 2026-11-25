import { rateAtAge } from '../lib/model'
import type { LinearFit, PerBin } from '../lib/model'
import { Tile } from './ui'
import { sci } from '../lib/format'
import { ObservedTest } from './ObservedTest'
import type { Observed } from './ObservedTest'
import type { Alternative } from '../lib/poisson'
import { AgeCalibrationChart } from './AgeCalibrationChart'

interface CohortSummaryProps {
  meanAge: number
  cohortAges: number[] | null
  n: number
  perIndividualRate: PerBin
  linearFit: LinearFit
  totals: { syn: number; mis: number; lof: number }
  scope: { label: string; nGenes: number } | null  // null = all genes
  observed: Observed
  onObserved: (o: Observed) => void
  alternative: Alternative
  onAlternative: (a: Alternative) => void
  misQualifier: string  // e.g. 'AM ≥ 0.55', empty for no missense filter
}

export function CohortSummary({
  meanAge, cohortAges, n, perIndividualRate, linearFit, totals, scope, observed, onObserved, alternative, onAlternative, misQualifier,
}: CohortSummaryProps) {
  const cohortRate = rateAtAge(meanAge, linearFit)
  const relDecode = cohortRate / rateAtAge(linearFit.meanAge, linearFit)
  return (
    <>
      <div className="totals">
        <Tile value={Math.round(n).toLocaleString()} label="Individuals (whole cohort)" />
        <div className="expected">
          <div className="expected-head">
            {scope
              ? <>Expected <i>de novo</i> SNVs in the gene set <b>{scope.label}</b> · {scope.nGenes.toLocaleString()} genes only</>
              : <>Expected <i>de novo</i> SNVs across all autosomal genes (exome)</>}
          </div>
          <div className="expected-tiles">
            <Tile value={totals.syn.toFixed(1)} label="Synonymous" />
            <Tile value={totals.mis.toFixed(1)} label={misQualifier ? `Missense, ${misQualifier}` : 'Missense'} />
            <Tile value={totals.lof.toFixed(2)} label="LoF" />
          </div>
          <ObservedTest
            expected={totals} observed={observed} onObserved={onObserved}
            alternative={alternative} onAlternative={onAlternative} misQualifier={misQualifier}
          />
        </div>
      </div>
      <AgeCalibrationChart
        meanAge={meanAge}
        linearFit={linearFit}
        perIndividualRate={perIndividualRate}
        cohortAges={cohortAges}
      />
      <p className="hint">
        Per-individual scale at <b>{meanAge.toFixed(2)} yr</b>: <b>{sci(cohortRate, 4)}</b> per unit Roulette MR
        {' '}({relDecode.toFixed(2)}× deCODE average; <code>{sci(linearFit.alpha, 3)} + {sci(linearFit.beta, 3)} × age</code>).
      </p>
    </>
  )
}
