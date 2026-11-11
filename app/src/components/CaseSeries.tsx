import { useMemo } from 'react'
import { GENE_RATES, GENE_SETS, RATE_GENE_INDEX } from '../data/sources'
import { parseGeneList, resolveGeneList } from '../lib/genesets'
import {
  CASE_CONSEQUENCE_LABELS, chanceSubmissions, childrenNeeded, GENEMATCHER, geneRate, median, percentileBelow,
} from '../lib/caseseries'
import type { CaseConsequence } from '../lib/caseseries'
import type { Consequence, Sites } from '../lib/model'
import { ppoisUpper } from '../lib/poisson'
import { Field, Panel, Segmented } from './ui'

export interface CaseState {
  genesText: string
  cons: CaseConsequence
  k: string
  log10N: number
  matches: string
}

export const CASE_DEFAULT: CaseState = { genesText: 'ARID1B', cons: 'mis', k: '10', log10N: 5, matches: '3' }

const DDD = 31_058
const PRESETS: [number, string][] = [[1e4, '10k'], [DDD, 'DDD 31k'], [1e5, '100k'], [3e5, '300k'], [1e6, '1M']]
const BASELINE_SET = 'ddg2p_mono'

export function fmtN(n: number): string {
  if (!Number.isFinite(n)) return '–'
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(2)} billion`
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(2)} million`
  if (n >= 1e4) return `${Math.round(n / 1e3).toLocaleString()}k`
  return Math.round(n).toLocaleString()
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
export function fmtP(p: number): string {
  if (p >= 0.995) return '> 0.99'
  if (p >= 0.01) return p.toFixed(2)
  if (p >= 0.001) return p.toFixed(3)
  if (p < 1e-300) return '< 10⁻³⁰⁰'
  const e = Math.floor(Math.log10(p))
  const sup = String(e).replace('-', '⁻').replace(/\d/g, d => SUP[+d])
  return `${(p / 10 ** e).toFixed(1)} × 10${sup}`
}

const fmtE = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2))
const oneIn = (r: number) => `1 in ${fmtN(1 / r)}`
const times = (r: number) => `${r.toFixed(r < 1 ? 2 : 1)}×`

interface Props {
  value: CaseState
  onChange: (v: CaseState) => void
  scale: number | null          // expected DNVs per child per unit of summed roulette rate
  cohortError: string | null
  cohortDescription: string
  sites: Sites
  lof: Consequence[]
  onCalculator: () => void
}

export function CaseSeries({ value, onChange, scale, cohortError, cohortDescription, sites, lof, onCalculator }: Props) {
  const set = (patch: Partial<CaseState>) => onChange({ ...value, ...patch })
  const { cons } = value
  const k = Math.max(1, Math.round(Number(value.k) || 1))
  const N = 10 ** value.log10N
  const matches = Math.max(0, Math.round(Number(value.matches) || 0))

  const resolved = useMemo(
    () => resolveGeneList(parseGeneList(value.genesText), RATE_GENE_INDEX, GENE_SETS.aliases),
    [value.genesText],
  )
  const byGene = useMemo(() => new Map(GENE_RATES.map(g => [g.gene, g])), [])
  const baseline = useMemo(() => {
    const ids = new Set(GENE_SETS.sets.find(s => s.id === BASELINE_SET)?.genes ?? [])
    return GENE_RATES.filter(g => ids.has(g.gene)).map(g => geneRate(g, sites, lof, cons)).sort((a, b) => a - b)
  }, [sites, lof, cons])
  const exomeRate = useMemo(
    () => GENE_RATES.reduce((s, g) => s + geneRate(g, sites, lof, 'both'), 0), [sites, lof],
  )

  const genes = resolved.genes.map(g => {
    const r = byGene.get(g)!
    return { gene: g, raw: geneRate(r, sites, lof, cons), rawBoth: geneRate(r, sites, lof, 'both') }
  })
  const label = CASE_CONSEQUENCE_LABELS[cons]
  const setName = genes.length === 1 ? genes[0].gene : `these ${genes.length} genes`

  return (
    <div className="grid">
      <div className="stack">
        <Panel title="Case series">
          <Field label="Genes (one or more; separate with spaces, commas or new lines)">
            <textarea className="genes-in" value={value.genesText} onChange={e => set({ genesText: e.target.value })}
              spellCheck={false} placeholder="ARID1B" />
          </Field>
          <p className="hint">
            {genes.length} {genes.length === 1 ? 'gene' : 'genes'} matched
            {resolved.renamed.length > 0 && <> ({resolved.renamed.map(([a, b]) => `${a}→${b}`).join(', ')})</>}
            {resolved.unmatched.length > 0 && <span className="warn">. Not found: {resolved.unmatched.join(', ')}</span>}
            . Counts are pooled across genes.
          </p>
          <div className="field"><span className="flabel">Variant type</span>
            <Segmented<CaseConsequence> label="Variant type" value={cons} onChange={c => set({ cons: c })}
              options={[{ value: 'mis', label: 'Missense' }, { value: 'lof', label: 'LoF' }, { value: 'both', label: 'Both' }]} />
          </div>
          <Field label="Patients in the case series">
            <input type="number" min={1} max={1000} step={1} value={value.k} onChange={e => set({ k: e.target.value })} />
          </Field>
          <div className="field">
            <span className="flabel">Children sequenced that the cases could have come from</span>
            <div className="nval">{fmtN(N)} children</div>
            <input type="range" min={3} max={8} step={0.01} value={value.log10N} aria-label="Children sequenced (log scale)"
              onChange={e => set({ log10N: Number(e.target.value) })} />
            <div className="presets">
              {PRESETS.map(([n, l]) => (
                <button key={l} type="button" onClick={() => set({ log10N: Math.log10(n) })}>{l}</button>
              ))}
            </div>
            <p className="hint">A guess is fine. The chart shows how much the answer depends on it.</p>
          </div>
          <p className="hint">
            Rates use the paternal ages and model set on the{' '}
            <button type="button" className="linklike" onClick={onCalculator}>Calculator</button> tab
            {cohortError ? '.' : <>: {cohortDescription}.</>}
          </p>
        </Panel>
      </div>

      <div className="stack">
        {cohortError || scale === null ? (
          <Panel title="Summary"><p className="err" role="alert">{cohortError ?? 'Set paternal ages on the Calculator tab.'}</p></Panel>
        ) : genes.length === 0 ? (
          <Panel title="Summary"><p className="hint">Enter at least one gene.</p></Panel>
        ) : (
          <Results {...{ genes, scale, k, N, matches, baseline, exomeRate, setName, label }}
            onMatches={m => set({ matches: m })} matchesText={value.matches} />
        )}
      </div>
    </div>
  )
}

interface ResultsProps {
  genes: { gene: string; raw: number; rawBoth: number }[]
  scale: number
  k: number
  N: number
  matches: number
  matchesText: string
  onMatches: (m: string) => void
  baseline: number[]
  exomeRate: number
  setName: string
  label: string
}

function Results({ genes, scale, k, N, matches, matchesText, onMatches, baseline, exomeRate, setName, label }: ResultsProps) {
  const mu = genes.reduce((s, g) => s + g.raw, 0) * scale
  const base = genes.length * median(baseline) * scale
  const lam = N * mu
  const p = ppoisUpper(k, lam)
  const n50 = childrenNeeded(k, mu, 0.5), n95 = childrenNeeded(k, mu, 0.95)
  const baseLabel = genes.length === 1 ? 'Median DDG2P gene' : `${genes.length} median DDG2P genes`
  const gmExp = chanceSubmissions(genes.reduce((s, g) => s + g.rawBoth, 0), exomeRate, GENEMATCHER.humanSubmissions)

  if (!(mu > 0)) return <Panel title="Summary"><p className="hint">These genes have no {label} sites with rates.</p></Panel>

  return (
    <>
      <Panel title="Summary">
        <p className="lede">
          If <b>{fmtN(N)}</b> children were sequenced, you would expect <b>{fmtE(lam)}</b> {label} <i>de novo</i> variants
          in <b>{setName}</b> by chance. Seeing <b>{k}</b> or more by chance has probability <b>{fmtP(p)}</b>. For
          chance alone to explain {k} cases, about <b>{fmtN(n50)}</b> children would need to have been sequenced.
        </p>
        <div className="tiles3">
          <div className="tile">
            <span>Chance rate per child</span><b>{oneIn(mu)}</b>
            <div className="det">
              <span className="chip">{times(mu / base)} the {genes.length === 1 ? 'DDG2P median' : `median for ${genes.length} DDG2P genes`}</span>
              {genes.length === 1 && <> {Math.round(100 * percentileBelow(baseline, genes[0].raw))}th percentile</>}
            </div>
          </div>
          <div className="tile">
            <span>Children needed to see {k} by chance</span><b>{fmtN(n50)}</b>
            <div className="det">50% chance. {fmtN(n95)} for 95%. Average: {fmtN(k / mu)}.</div>
          </div>
          <div className="tile key">
            <span>P(≥ {k} by chance) in {fmtN(N)}</span><b>{fmtP(p)}</b>
            <div className="det">{baseLabel}: {fmtP(ppoisUpper(k, N * base))}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Chance of the case series against children sequenced">
        <CaseChart k={k} N={N} mu={mu} base={base} />
        <div className="legend">
          <span><i />{setName}, {label}</span>
          <span><i className="b" />{baseLabel}, same variant type</span>
          <span><i className="r" />DDD (31,058 trios)</span>
        </div>
      </Panel>

      {genes.length > 1 && (
        <Panel title="Per gene">
          <div className="scroll"><table>
            <thead><tr><th>Gene</th><th>Chance rate per child</th><th>vs DDG2P median</th><th>DDG2P percentile</th><th>Share of set</th></tr></thead>
            <tbody>
              {[...genes].sort((a, b) => b.raw - a.raw).map(g => (
                <tr key={g.gene}>
                  <td><i>{g.gene}</i></td>
                  <td>{g.raw > 0 ? oneIn(g.raw * scale) : '–'}</td>
                  <td>{g.raw > 0 ? times(g.raw / median(baseline)) : '–'}</td>
                  <td>{Math.round(100 * percentileBelow(baseline, g.raw))}</td>
                  <td>{(100 * g.raw * scale / mu).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>
      )}

      <Panel title="GeneMatcher matches by chance">
        <p className="lede">
          GeneMatcher held <b>{GENEMATCHER.humanSubmissions.toLocaleString()}</b> human submissions on {GENEMATCHER.date}.
          If each were a random missense or LoF <i>de novo</i> variant, about <b>{fmtE(gmExp)}</b> would fall
          in <b>{setName}</b> by chance.
        </p>
        <div className="gm-row">
          <Field label="Matches you found">
            <input type="number" min={0} step={1} value={matchesText} onChange={e => onMatches(e.target.value)} />
          </Field>
          <div className="tile key">
            <span>P(≥ {matches} chance submissions)</span><b>{fmtP(ppoisUpper(matches, gmExp))}</b>
          </div>
        </div>
        <div className="scroll"><table>
          <thead><tr><th>Chance submissions</th>{[1, 2, 3, 5, 10].map(j => <th key={j}>≥ {j}</th>)}</tr></thead>
          <tbody><tr><td>Probability</td>{[1, 2, 3, 5, 10].map(j => <td key={j}>{fmtP(ppoisUpper(j, gmExp))}</td>)}</tr></tbody>
        </table></div>
        <p className="hint">
          Matches are gene-level, so this uses missense + LoF whatever the variant type above, as a share of the
          exome-wide rate. Submissions are not random: they include inherited and recessive candidates and favour
          known disease genes, so treat this as a rough guide. A match is only evidence if the phenotype fits better
          than a random proband's would. Source: <a href={GENEMATCHER.url} target="_blank" rel="noreferrer">GeneMatcher
          statistics</a>, copied {GENEMATCHER.date} (the site blocks automated reads, so it is not fetched live).
        </p>
      </Panel>

      <details className="panel method">
        <summary>How these numbers are calculated</summary>
        <p>
          μ is the expected number of <i>de novo</i> variants of the chosen type per child, summed over the genes: each
          gene's summed Roulette rate times the deCODE calibration for the Calculator tab's paternal ages, per
          individual. In N children the chance count is Poisson(Nμ).
        </p>
        <p>
          P(≥ k by chance) is the Poisson upper tail. The children needed for probability q of reaching k is
          N<sub>q</sub> = qgamma(q, shape = k) / μ, because P(Poisson(λ) ≥ k) = P(Gamma(k, 1) ≤ λ).
        </p>
        <p>
          The DDG2P baseline is the median rate among DDG2P monoallelic genes, times the number of genes entered. This
          treats the case series as unselected. Real series are ascertained on phenotype, which makes chance less likely
          when the phenotype is distinctive.
        </p>
      </details>
    </>
  )
}

function CaseChart({ k, N, mu, base }: { k: number; N: number; mu: number; base: number }) {
  const W = 720, H = 300, L = 52, R = 16, T = 14, B = 44
  const fast = Math.max(mu, base), slow = Math.min(mu, base)
  const x0 = Math.min(3, Math.floor(Math.log10(Math.min(N, childrenNeeded(k, fast, 0.01)))))
  const x1 = Math.max(8, Math.ceil(Math.log10(Math.max(N, childrenNeeded(k, slow, 0.5) * 20))))
  const sx = (v: number) => L + (Math.log10(v) - x0) / (x1 - x0) * (W - L - R)
  const sy = (p: number) => T + (1 - p) * (H - T - B)
  const path = (r: number) => Array.from({ length: 241 }, (_, i) => {
    const n = 10 ** (x0 + (x1 - x0) * i / 240)
    return `${i ? 'L' : 'M'}${sx(n).toFixed(1)},${sy(ppoisUpper(k, n * r)).toFixed(1)}`
  }).join('')
  const step = x1 - x0 > 6 ? 2 : 1
  const decades = Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => x0 + i * step)
  const tick = (e: number) => (e < 4 ? (10 ** e).toLocaleString() : e < 6 ? `${10 ** (e - 3)}k` : e < 9 ? `${10 ** (e - 6)}M` : `${10 ** (e - 9)}B`)
  const p = ppoisUpper(k, N * mu), cx = sx(N), cy = sy(p), right = cx > W - 170
  const ymid = (T + H - B) / 2

  return (
    <div className="scroll">
      <svg className="case-chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Probability of at least ${k} by chance against children sequenced`}>
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line)" />
            <text x={L - 8} y={sy(v) + 4} textAnchor="end" className="ax">{v.toFixed(2)}</text>
          </g>
        ))}
        {decades.map(e => (
          <g key={e}>
            <line x1={sx(10 ** e)} x2={sx(10 ** e)} y1={H - B} y2={H - B + 4} stroke="var(--muted)" />
            <text x={sx(10 ** e)} y={H - B + 17} textAnchor="middle" className="ax">{tick(e)}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="ax lg">Children sequenced (log scale)</text>
        <text x={12} y={ymid} transform={`rotate(-90 12 ${ymid})`} textAnchor="middle" className="ax lg">P(≥ {k} by chance)</text>
        {Math.log10(DDD) > x0 && Math.log10(DDD) < x1 && (
          <g>
            <line x1={sx(DDD)} x2={sx(DDD)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="1 3" />
            <text x={sx(DDD) + 4} y={T + 10} className="ax">DDD</text>
          </g>
        )}
        <path d={path(base)} fill="none" stroke="var(--base)" strokeWidth={2} strokeDasharray="5 4" />
        <path d={path(mu)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <line x1={cx} x2={cx} y1={T} y2={H - B} stroke="var(--accent)" strokeOpacity={0.35} />
        <circle cx={cx} cy={cy} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
        <text x={cx + (right ? -9 : 9)} y={Math.max(T + 26, cy - 8)} textAnchor={right ? 'end' : 'start'} className="pt">
          {fmtN(N)}: {fmtP(p)}
        </text>
      </svg>
    </div>
  )
}
