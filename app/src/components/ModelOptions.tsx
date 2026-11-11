import { BACKGROUNDS, BIN_LABELS, BINS, LOF_OPTIONS } from '../lib/model'
import type { Background, Consequence, PerBin, Sites } from '../lib/model'
import { cutoffAt, MISSENSE_SCORES, SCORE_CUTOFFS, SCORE_DEFAULT_THRESHOLD } from '../lib/missense'
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
      <details className="advanced">
        <summary>Advanced model settings (defaults recommended)</summary>
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
        <p className="hint">
          If your pipeline calls hard-to-sequence regions, choose All sites: high-quality sites give lower expected
          counts and so smaller p-values. <button type="button" className="linklike" onClick={p.onAbout}>About</button>
        </p>
        <div className="field">
          <span className="flabel">deCODE probands per age bin (converts each k to a per-individual rate)</span>
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
            <option key={s} value={s}>{MISSENSE_SCORES[s]}, published cutoff</option>
          ))}
        </select>
      </label>
      {value.score !== 'none' && (
        <>
          <div className="presets cutoffs" role="group" aria-label={`${MISSENSE_SCORES[value.score]} cutoff`}>
            {SCORE_CUTOFFS[value.score].map(c => (
              <button
                type="button" key={c.t} aria-pressed={cutoffAt(value.score as MissenseScore, value.threshold) === c}
                onClick={() => onChange({ ...value, threshold: c.t })}
              >{c.name} <span>{c.label}</span></button>
            ))}
          </div>
          {shares && (
            <p className="hint">
              {pct(shares.passing)} of the missense rate passes ({pct(shares.scored)} scored; unscored sites are excluded).
            </p>
          )}
          {shares && shares.scored < 0.5 && (
            <p className="hint warn">Mostly unscored by {MISSENSE_SCORES[value.score]} here: try the other score.</p>
          )}
        </>
      )}
    </div>
  )
}
