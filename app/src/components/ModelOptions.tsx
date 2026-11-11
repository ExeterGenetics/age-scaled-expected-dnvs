import { BACKGROUNDS, BIN_LABELS, BINS, LOF_OPTIONS } from '../lib/model'
import type { Background, Consequence, PerBin, Sites } from '../lib/model'
import { MISSENSE_SCORES, SCORE_CUTOFFS, SCORE_DEFAULT_THRESHOLD, SCORE_STEP } from '../lib/missense'
import type { MissenseFilter, MissenseScore } from '../lib/missense'
import { Field } from './ui'

interface ModelOptionsProps {
  background: Background
  onBackground: (b: Background) => void
  sites: Sites
  onSites: (s: Sites) => void
  lof: Consequence[]
  onLof: (lof: Consequence[]) => void
  missense: MissenseFilter
  onMissense: (f: MissenseFilter) => void
  missenseShares: { scored: number; passing: number } | null
  nDecode: PerBin
  onNDecode: (n: PerBin) => void
  onAbout: () => void
}

export function ModelOptions(p: ModelOptionsProps) {
  const toggleLof = (c: Consequence) =>
    p.onLof(LOF_OPTIONS.filter(o => (o === c ? !p.lof.includes(c) : p.lof.includes(o))))

  return (
    <>
      <Field label="Calibration background">
        <select value={p.background} onChange={e => p.onBackground(e.target.value as Background)}>
          {(Object.keys(BACKGROUNDS) as Background[]).map(b => <option key={b} value={b}>{BACKGROUNDS[b]}</option>)}
        </select>
      </Field>
      <Field label="Sites included per gene">
        <select value={p.sites} onChange={e => p.onSites(e.target.value as Sites)}>
          <option value="hq">High-quality sites only</option>
          <option value="all">All sites, including hard-to-sequence regions</option>
        </select>
      </Field>
      <p className="hint model-help">What these mean: <button type="button" className="linklike" onClick={p.onAbout}>About</button></p>
      <fieldset className="checks">
        <legend>LoF consequences</legend>
        {LOF_OPTIONS.map(c => (
          <label key={c}>
            <input type="checkbox" checked={p.lof.includes(c)} onChange={() => toggleLof(c)} />
            {c.replace('_', ' ')}
          </label>
        ))}
      </fieldset>
      <MissenseFilterField value={p.missense} onChange={p.onMissense} shares={p.missenseShares} />
      <details className="ndecode">
        <summary>deCODE probands per bin</summary>
        <p className="hint">Divides each k (a cohort total) into a per-individual rate.</p>
        <div className="ngrid">
          {BINS.map(b => (
            <Field key={b} label={BIN_LABELS[b]}>
              <input
                type="number" min="1" step="1" value={p.nDecode[b]}
                onChange={e => p.onNDecode({ ...p.nDecode, [b]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      </details>
    </>
  )
}

interface MissenseFilterFieldProps {
  value: MissenseFilter
  onChange: (f: MissenseFilter) => void
  shares: { scored: number; passing: number } | null
}

export function MissenseFilterField({ value, onChange, shares }: MissenseFilterFieldProps) {
  const pct = (x: number) => `${(100 * x).toFixed(x < 0.995 ? 0 : 1)}%`
  const onScore = (s: MissenseScore | 'none') =>
    onChange(s === 'none' ? { ...value, score: s }
      : { score: s, threshold: value.score === s ? value.threshold : SCORE_DEFAULT_THRESHOLD[s] })
  return (
    <div className="field missense-filter">
      <label className="field">
        <span>Missense score filter</span>
        <select value={value.score} onChange={e => onScore(e.target.value as MissenseScore | 'none')}>
          <option value="none">None: all missense variants</option>
          {(Object.keys(MISSENSE_SCORES) as MissenseScore[]).map(s => (
            <option key={s} value={s}>{MISSENSE_SCORES[s]} score at or above a threshold</option>
          ))}
        </select>
      </label>
      {value.score !== 'none' && (
        <>
          <div className="thresh">
            <input
              type="range" min={0} max={1 - SCORE_STEP} step={SCORE_STEP} value={value.threshold}
              aria-label={`${MISSENSE_SCORES[value.score]} threshold`}
              onChange={e => onChange({ ...value, threshold: Number(e.target.value) })}
            />
            <b>≥ {value.threshold.toFixed(2)}</b>
          </div>
          <p className="hint">
            Only missense sites scoring at or above this count; sites with no score are left out.
            {shares && <> Here {pct(shares.passing)} of the missense rate passes ({pct(shares.scored)} has a score).</>}
            {' '}{SCORE_CUTOFFS[value.score]} Steps of 0.05.
          </p>
          {shares && shares.scored < 0.5 && (
            <p className="hint warn">
              Most of this missense rate has no {MISSENSE_SCORES[value.score]} score, so the filtered expectation
              mostly reflects missing scores. Try the other score or no filter.
            </p>
          )}
        </>
      )}
    </div>
  )
}
