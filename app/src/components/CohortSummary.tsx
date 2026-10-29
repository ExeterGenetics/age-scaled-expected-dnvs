import { BIN_LABELS, BINS } from '../lib/model'
import type { PerBin } from '../lib/model'
import { Tile } from './ui'
import { ObservedTest } from './ObservedTest'
import type { Observed } from './ObservedTest'
import type { Alternative } from '../lib/poisson'

interface CohortSummaryProps {
  counts: PerBin
  n: number
  perIndividualRate: PerBin
  totals: { syn: number; mis: number; lof: number }
  integerCounts: boolean
  scope: { label: string; nGenes: number } | null  // null = all genes
  observed: Observed
  onObserved: (o: Observed) => void
  alternative: Alternative
  onAlternative: (a: Alternative) => void
}

export function CohortSummary({
  counts, n, perIndividualRate, totals, integerCounts, scope, observed, onObserved, alternative, onAlternative,
}: CohortSummaryProps) {
  const max = Math.max(...BINS.map(b => counts[b])) || 1
  return (
    <>
      <div className="totals">
        <Tile value={Math.round(n).toLocaleString()} label="Individuals (whole cohort)" />
        <div className="expected">
          <div className="expected-head">
            {scope
              ? <>Expected <i>de novo</i> SNVs in the gene set <b>{scope.label}</b> · {scope.nGenes.toLocaleString()} genes only</>
              : <>Expected <i>de novo</i> SNVs across all genes (exome)</>}
          </div>
          <div className="expected-tiles">
            <Tile value={totals.syn.toFixed(1)} label="Synonymous" />
            <Tile value={totals.mis.toFixed(1)} label="Missense" />
            <Tile value={totals.lof.toFixed(2)} label="LoF" />
          </div>
          <ObservedTest
            expected={totals} observed={observed} onObserved={onObserved}
            alternative={alternative} onAlternative={onAlternative}
          />
        </div>
      </div>
      <div className="scroll">
        <table className="bins">
          <thead>
            <tr>
              <th>Paternal age</th><th>Individuals</th><th>Share</th><th className="barcell" aria-hidden />
              <th title="k / deCODE probands: expected de novo variants per proband per unit of Roulette rate">k / N<sub>deCODE</sub></th>
            </tr>
          </thead>
          <tbody>
            {BINS.map(b => (
              <tr key={b}>
                <td>{BIN_LABELS[b]}</td>
                <td>{integerCounts ? counts[b] : counts[b].toFixed(1)}</td>
                <td>{(100 * counts[b] / n).toFixed(1)}%</td>
                <td className="barcell"><div className="bar" style={{ width: `${100 * counts[b] / max}%` }} /></td>
                <td>{perIndividualRate[b].toExponential(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
