import { BACKGROUNDS, BIN_LABELS, BINS, LOF_OPTIONS } from '../lib/model'
import type { Background, Consequence, PerBin, Sites } from '../lib/model'
import { Field } from './ui'

interface ModelOptionsProps {
  background: Background
  onBackground: (b: Background) => void
  sites: Sites
  onSites: (s: Sites) => void
  lof: Consequence[]
  onLof: (lof: Consequence[]) => void
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
