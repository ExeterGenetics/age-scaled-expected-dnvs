import { poissonTest } from '../lib/poisson'
import type { Alternative } from '../lib/poisson'

export type Klass = 'syn' | 'mis' | 'lof'
export type Observed = Record<Klass, string>

const KLASSES: { key: Klass; label: string }[] = [
  { key: 'syn', label: 'Synonymous' }, { key: 'mis', label: 'Missense' }, { key: 'lof', label: 'LoF' },
]
const ALTERNATIVES: Record<Alternative, string> = {
  greater: 'One-sided: enrichment (observed > expected)',
  'two.sided': 'Two-sided',
  less: 'One-sided: depletion (observed < expected)',
}

interface ObservedTestProps {
  expected: Record<Klass, number>
  observed: Observed
  onObserved: (o: Observed) => void
  alternative: Alternative
  onAlternative: (a: Alternative) => void
}

const fmtP = (p: number) => (p >= 0.001 ? p.toFixed(3) : p.toExponential(2))
const fmtR = (r: number) => (r >= 100 ? r.toFixed(0) : r.toPrecision(3))

function invalidReason(text: string, expected: number): string | null {
  if (text.trim() === '') return 'Enter a count'
  const x = Number(text)
  if (!Number.isInteger(x) || x < 0) return 'Whole number ≥ 0'
  if (!(expected > 0)) return 'No expected count'
  return null
}

export function ObservedTest({ expected, observed, onObserved, alternative, onAlternative }: ObservedTestProps) {
  return (
    <details className="observed">
      <summary>Compare with observed counts (Poisson test)</summary>
      <div className="obs-head">
        <span>Observed <i>de novo</i> SNVs in the same genes, tested against expected (exact Poisson)</span>
        <select value={alternative} onChange={e => onAlternative(e.target.value as Alternative)} aria-label="Alternative hypothesis">
          {Object.entries(ALTERNATIVES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="expected-tiles">
        {KLASSES.map(({ key, label }) => {
          const text = observed[key]
          const reason = invalidReason(text, expected[key])
          const t = reason ? null : poissonTest(Number(text), expected[key], alternative)
          return (
            <div className="tile obs" key={key}>
              <input
                type="number" min={0} step={1} inputMode="numeric" value={text} placeholder="0"
                aria-label={`Observed ${label}`}
                onChange={e => onObserved({ ...observed, [key]: e.target.value })}
              />
              <span>Observed {label}</span>
              {t ? (
                <span className="obs-res">
                  O/E {fmtR(t.ratio)} (95% CI {fmtR(t.ci[0])}–{fmtR(t.ci[1])})
                  <b className={t.p < 0.05 ? 'sig' : undefined}>p = {fmtP(t.p)}</b>
                </span>
              ) : (
                <span className={text.trim() === '' ? 'obs-res' : 'obs-res err'}>{reason}</span>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
