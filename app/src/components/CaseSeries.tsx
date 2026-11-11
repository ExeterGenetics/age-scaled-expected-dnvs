import { fmtP } from '../lib/format'
import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { DATA_VERSIONS, GENE_SETS, MISSENSE_BINS, NON_AUTOSOMAL, RATE_GENE_INDEX } from '../data/sources'
import { filterLabel, filterShares } from '../lib/missense'
import type { MissenseFilter } from '../lib/missense'
import { MissenseFilterField } from './ModelOptions'
import { describeOffAutosome, parseGeneList, resolveGeneList, splitUnmatched } from '../lib/genesets'
import {
  CASE_CONSEQUENCE_LABELS, chanceMatches, individualsNeeded, MME, MME_CASES, geneRate, median, percentileBelow,
} from '../lib/caseseries'
import type { CaseConsequence } from '../lib/caseseries'
import type { Consequence, GeneRates, Sites } from '../lib/model'
import { ppoisUpper } from '../lib/poisson'
import { Field, Genes, OffAutosome, Panel, Renames, Segmented } from './ui'
import { TsvAgeInput } from './AgeInputs'
import { ReportExport } from './CaseReport'
import { BUILD, num, TOOL_NAME, TOOL_URL } from '../lib/report'
import type { ReportRow } from '../lib/report'
import type { TsvState } from './AgeInputs'

export interface CaseState {
  genesText: string
  cons: CaseConsequence
  k: string
  log10N: number
  matches: string
}

export const CASE_DEFAULT: CaseState = { genesText: 'ARID1B', cons: 'mis', k: '10', log10N: 5, matches: '3' }

const DDD = 31_058
// report fields holding gene symbols, italic in the PDF
const GENE_FIELDS = new Set(['Genes entered', 'Genes tested', 'Renamed', 'Not modelled (not autosomal)', 'Not found'])
const PRESETS: [number, string][] = [[1e4, '10k'], [DDD, 'DDD 31k'], [1e5, '100k'], [3e5, '300k'], [1e6, '1M']]
const BASELINE_SET = 'ddg2p_mono'

export function fmtN(n: number): string {
  if (!Number.isFinite(n)) return '–'
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(2)} billion`
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(2)} million`
  if (n >= 1e4) return `${Math.round(n / 1e3).toLocaleString()}k`
  return Math.round(n).toLocaleString()
}


const fmtE = (x: number) => (x >= 10 ? Math.round(x).toLocaleString() : x >= 0.1 ? x.toFixed(2) : x.toPrecision(2))
const oneIn = (r: number) => `1 in ${fmtN(1 / r)}`
// probability for export: 4 significant figures, never shown as exactly 1
const pnum = (p: number) => (p >= 0.99995 ? '> 0.9999' : num(p))
const times = (r: number) => `${r.toFixed(r < 1 ? 2 : 1)}×`

export type CaseAgeMode = 'decode' | 'normal' | 'tsv'
interface AgeProps {
  mode: CaseAgeMode
  onMode: (m: CaseAgeMode) => void
  normal: { mean: string; sd: string }
  onNormal: (v: { mean: string; sd: string }) => void
  tsv: TsvState
  onTsv: (v: TsvState) => void
  summary: { ages: number[]; skipped: number } | null
}

interface Props {
  value: CaseState
  onChange: (v: CaseState) => void
  scale: number | null          // expected DNVs per individual per unit of summed roulette rate
  cohortError: string | null
  cohortDescription: string
  ages: AgeProps                // paternal age distribution of the individuals sequenced
  modelDescription: string      // calibration background and deCODE proband counts, for the report
  modelSummary: string          // one-line summary of the shared model settings, shown on the tab
  sites: Sites
  lof: Consequence[]
  onCalculator: () => void
  rates: GeneRates[]              // missense already restricted by the score filter
  missense: MissenseFilter
  onMissense: (f: MissenseFilter) => void
}

export function CaseSeries({
  value, onChange, scale, cohortError, cohortDescription, ages, modelDescription, modelSummary, sites, lof, onCalculator, rates, missense,
  onMissense,
}: Props) {
  const set = (patch: Partial<CaseState>) => onChange({ ...value, ...patch })
  const { cons } = value
  const k = Math.max(1, Math.round(Number(value.k) || 1))
  const N = 10 ** value.log10N
  const matches = Math.max(0, Math.round(Number(value.matches) || 0))

  const resolved = useMemo(
    () => resolveGeneList(parseGeneList(value.genesText), RATE_GENE_INDEX, GENE_SETS.aliases),
    [value.genesText],
  )
  const unmatched = useMemo(() => splitUnmatched(resolved.unmatched, NON_AUTOSOMAL), [resolved.unmatched])
  const byGene = useMemo(() => new Map(rates.map(g => [g.gene, g])), [rates])
  const baseline = useMemo(() => {
    const ids = new Set(GENE_SETS.sets.find(s => s.id === BASELINE_SET)?.genes ?? [])
    return rates.filter(g => ids.has(g.gene)).map(g => geneRate(g, sites, lof, cons)).sort((a, b) => a - b)
  }, [rates, sites, lof, cons])

  const genes = resolved.genes.map(g => {
    const r = byGene.get(g)!
    return { gene: g, raw: geneRate(r, sites, lof, cons), rawBoth: geneRate(r, sites, lof, 'both') }
  })
  const q = filterLabel(missense)
  const usesMissense = cons !== 'lof'
  const label = CASE_CONSEQUENCE_LABELS[cons] + (q && usesMissense ? ` (missense ${q})` : '')
  const shares = missense.score === 'none' ? null : filterShares(resolved.genes, MISSENSE_BINS, missense, sites)
  const setName = genes.length === 1 ? genes[0].gene : `these ${genes.length} genes`
  const setNode = genes.length === 1 ? <i>{genes[0].gene}</i> : setName
  // which patients to count: the same variants the expectation covers
  const lofNames = lof.map(c => c.replace('_', ' '))
  const lofText = lofNames.length > 1 ? `${lofNames.slice(0, -1).join(', ')} or ${lofNames[lofNames.length - 1]}` : lofNames[0] ?? 'no LoF classes'
  const misText = `missense${q ? ` (${q})` : ''}`
  const countRule = `Count only patients whose de novo is an SNV: ${cons === 'mis' ? misText : cons === 'lof' ? lofText : `${misText}, or ${lofText}`}. Leave out frameshifts and other indels, which are not modelled.`
  // every input, for the exported report
  const inputs: ReportRow[] = [
    ['Genes entered', parseGeneList(value.genesText).join(', ')],
    ['Genes tested', resolved.genes.join(', ') || 'none'],
    ...(resolved.renamed.length ? [['Renamed', resolved.renamed.map(([a, b]) => `${a}→${b}`).join(', ')]] : []),
    ...(unmatched.offAutosome.length ? [['Not modelled (not autosomal)', describeOffAutosome(unmatched.offAutosome, 50)]] : []),
    ...(unmatched.unknown.length ? [['Not found', unmatched.unknown.join(', ')]] : []),
    ['Variant type', CASE_CONSEQUENCE_LABELS[cons]],
    ['Missense score filter', usesMissense ? (q || 'none') : 'not used'],
    ['LoF consequences', lof.join(', ').replace(/_/g, ' ')],
    ['Sites', sites === 'hq' ? 'high-quality sites only' : 'all sites'],
    ['Model', modelDescription],
    ['Paternal ages', cohortDescription],
    ['Patients in the case series (k)', String(k)],
    ['Patients counted', countRule.replace('Count only patients', 'Patients')],
    ['Individuals sequenced (N)', Math.round(N).toLocaleString()],
    ['Matches found in Matchmaker Exchange', String(matches)],
  ].map(([field, v]) => ({ section: 'Inputs', field, value: v, ...(GENE_FIELDS.has(field) ? { italic: 'value' as const } : {}) }))

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
            {resolved.renamed.length > 0 && <> (<Renames pairs={resolved.renamed} />)</>}
            {unmatched.offAutosome.length > 0 && (
              <span className="warn">. Not modelled, as rates are autosomal only: <OffAutosome genes={unmatched.offAutosome} /></span>
            )}
            {unmatched.unknown.length > 0 && <span className="warn">. Not found: <Genes list={unmatched.unknown} /></span>}
            ; counts are pooled.
          </p>
          <div className="field"><span className="flabel">Variant type</span>
            <Segmented<CaseConsequence> label="Variant type" value={cons} onChange={c => set({ cons: c })}
              options={[{ value: 'mis', label: 'Missense' }, { value: 'lof', label: 'LoF' }, { value: 'both', label: 'Both' }]} />
          </div>
          {usesMissense && <MissenseFilterField value={missense} onChange={onMissense} shares={shares} />}
          <Field label="Patients in the case series">
            <input type="number" min={1} max={1000} step={1} value={value.k} onChange={e => set({ k: e.target.value })} />
          </Field>
          <p className="hint count-rule">{countRule}</p>
          <div className="field">
            <span className="flabel">Individuals sequenced that the cases could have come from</span>
            <div className="nval">{fmtN(N)} individuals</div>
            <input type="range" min={3} max={8} step={0.01} value={value.log10N} aria-label="Individuals sequenced (log scale)"
              onChange={e => set({ log10N: Number(e.target.value) })} />
            <div className="presets">
              {PRESETS.map(([n, l]) => (
                <button key={l} type="button" onClick={() => set({ log10N: Math.log10(n) })}>{l}</button>
              ))}
            </div>
            <p className="hint">A guess is fine; the chart shows how much it matters.</p>
          </div>
          <div className="field">
            <span className="flabel">Their paternal ages</span>
            <Segmented<CaseAgeMode> label="Paternal ages" value={ages.mode} onChange={ages.onMode}
              options={[{ value: 'decode', label: 'deCODE mix' }, { value: 'normal', label: 'Mean & SD' }, { value: 'tsv', label: 'From TSV' }]} />
          </div>
          {ages.mode === 'normal' && (
            <div className="row2">
              <Field label="Mean age">
                <input type="number" step="0.1" value={ages.normal.mean} onChange={e => ages.onNormal({ ...ages.normal, mean: e.target.value })} />
              </Field>
              <Field label="SD">
                <input type="number" step="0.1" min="0" value={ages.normal.sd} onChange={e => ages.onNormal({ ...ages.normal, sd: e.target.value })} />
              </Field>
            </div>
          )}
          {ages.mode === 'tsv' && <TsvAgeInput value={ages.tsv} onChange={ages.onTsv} summary={ages.summary} />}
          <p className="hint model-summary" title={cohortDescription ? `Rates use ${cohortDescription}.` : undefined}>
            Model: {modelSummary}. Change on the{' '}
            <button type="button" className="linklike" onClick={onCalculator}>Expected counts</button> tab.
          </p>
        </Panel>
      </div>

      <div className="stack">
        {cohortError || scale === null ? (
          <Panel title="Summary"><p className="err" role="alert">{cohortError ?? 'Check the model settings on the Expected counts tab.'}</p></Panel>
        ) : genes.length === 0 ? (
          <Panel title="Summary"><p className="hint">Enter at least one gene.</p></Panel>
        ) : (
          <Results {...{ genes, scale, k, N, matches, baseline, setName, setNode, label }} gmLabel={q ? `missense (${q}) or LoF` : 'missense or LoF'}
            onMatches={m => set({ matches: m })} matchesText={value.matches} inputs={inputs} />
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
  setName: string
  setNode: ReactNode   // setName with a single gene in italics
  label: string
  gmLabel: string
  inputs: ReportRow[]
}

function Results({ genes, scale, k, N, matches, matchesText, onMatches, baseline, setName, setNode, label, gmLabel, inputs }: ResultsProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const mu = genes.reduce((s, g) => s + g.raw, 0) * scale
  const base = genes.length * median(baseline) * scale
  const lam = N * mu
  const p = ppoisUpper(k, lam)
  const n50 = individualsNeeded(k, mu, 0.5), n95 = individualsNeeded(k, mu, 0.95)
  const baseLabel = genes.length === 1 ? 'Median DDG2P gene' : `${genes.length} median DDG2P genes`
  const gmExp = chanceMatches(genes.reduce((s, g) => s + g.rawBoth, 0) * scale, MME_CASES)

  if (!(mu > 0)) return <Panel title="Summary"><p className="hint">These genes have no {label} sites with rates.</p></Panel>

  const pct = genes.length === 1 ? Math.round(100 * percentileBelow(baseline, genes[0].raw)) : null
  const rows: ReportRow[] = [
    ...inputs,
    ...([
      [`Expected ${label} de novos by chance in N`, num(lam)],
      ['Chance rate per individual', `${num(mu)} (${oneIn(mu)})`],
      ['Relative to DDG2P median', `${num(mu / base)}×${pct !== null ? `; ${pct}th percentile` : ''}`],
      [`P(≥ ${k} by chance) in N`, pnum(p)],
      [`P(≥ ${k} by chance) in N, ${genes.length === 1 ? 'median DDG2P gene' : `${genes.length} median DDG2P genes`}`, pnum(ppoisUpper(k, N * base))],
      [`Individuals needed for ≥ ${k} by chance`, `${Math.round(n50).toLocaleString()} (50%), ${Math.round(n95).toLocaleString()} (95%), ${Math.round(k / mu).toLocaleString()} (average)`],
    ] as [string, string][]).map(([field, value]) => ({ section: 'Result', field, value })),
    ...([
      ['Cases in MME', `${MME_CASES.toLocaleString()} (${MME.date})`],
      [`Expected chance cases with a ${gmLabel} de novo`, num(gmExp)],
      [`P(≥ ${matches} chance matches)`, pnum(ppoisUpper(matches, gmExp))],
    ] as [string, string][]).map(([field, value]) => ({ section: 'Matchmaker Exchange', field, value })),
    ...(genes.length > 1 ? genes.map(g => ({
      section: 'Per gene', field: g.gene, italic: 'field' as const,
      value: g.raw > 0 ? `${num(g.raw * scale)} per individual; ${Math.round(100 * g.raw * scale / mu)}% of the set` : 'no sites',
    })) : []),
    ...DATA_VERSIONS.map(([field, value]) => ({ section: 'Data versions', field, value })),
    { section: 'Data versions', field: 'Matchmaker Exchange counts', value: `${MME.date} statistics page` },
    { section: 'Tool', field: 'Name', value: TOOL_NAME },
    { section: 'Tool', field: 'URL', value: TOOL_URL },
    { section: 'Tool', field: 'Build', value: `${BUILD.date} (${BUILD.commit})` },
  ]

  return (
    <>
      <Panel title="Summary">
        <p className="lede">
          In <b>{fmtN(N)}</b> individuals, <b>{fmtE(lam)}</b> {label} <i>de novos</i> in <b>{setNode}</b> are expected by chance.
        </p>
        <div className="tiles3">
          <div className="tile">
            <span>Chance rate per individual</span><b>{oneIn(mu)}</b>
            <div className="det">
              <span className="chip">{times(mu / base)} the {genes.length === 1 ? 'DDG2P median' : `median for ${genes.length} DDG2P genes`}</span>
              {genes.length === 1 && <> {Math.round(100 * percentileBelow(baseline, genes[0].raw))}th percentile</>}
            </div>
          </div>
          <div className="tile">
            <span>Individuals needed to see {k} by chance</span><b>{fmtN(n50)}</b>
            <div className="det">50% chance. {fmtN(n95)} for 95%. Average: {fmtN(k / mu)}.</div>
          </div>
          <div className="tile key">
            <span>P(≥ {k} by chance) in {fmtN(N)}</span><b>{fmtP(p)}</b>
            <span className={`verdict ${p < 0.01 ? 'unlikely' : p < 0.05 ? 'borderline' : 'plausible'}`}>
              {p < 0.01 ? 'Unlikely by chance' : p < 0.05 ? 'Borderline' : 'Plausible by chance'} at {fmtN(N)}
            </span>
            <div className="det">
              {genes.length === 1 ? 'A typical DDG2P gene' : `${genes.length} typical DDG2P genes`}: {fmtP(ppoisUpper(k, N * base))}
            </div>
            <div className="det muted">If you checked several genes, correct for multiple testing.</div>
          </div>
        </div>
      </Panel>

      <Panel title="Chance of the case series against individuals sequenced">
        <div ref={chartRef}><CaseChart k={k} N={N} mu={mu} base={base} /></div>
        <div className="legend">
          <span><i />{setNode}, {label}</span>
          <span><i className="b" />{baseLabel}, same variant type</span>
          <span><i className="r" />DDD (31,058 trios)</span>
        </div>
      </Panel>

      {genes.length > 1 && (
        <Panel title="Per gene">
          <div className="scroll"><table>
            <thead><tr><th>Gene</th><th>Chance rate per individual</th><th>vs DDG2P median</th><th>DDG2P percentile</th><th>Share of set</th></tr></thead>
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

      <Panel title="Matchmaker Exchange matches by chance">
        <p className="lede">
          Of <b>{MME_CASES.toLocaleString()}</b> cases ({MME.date}), about <b>{fmtE(gmExp)}</b> would carry a chance {gmLabel}{' '}
          <i>de novo</i> in <b>{setNode}</b>.
        </p>
        <div className="gm-row">
          <Field label="Matches you found">
            <input type="number" min={0} step={1} value={matchesText} onChange={e => onMatches(e.target.value)} />
          </Field>
          <div className="tile key">
            <span>P(≥ {matches} chance matches)</span><b>{fmtP(ppoisUpper(matches, gmExp))}</b>
          </div>
        </div>
        <div className="scroll"><table>
          <thead><tr><th>Chance matches</th>{[1, 2, 3, 5, 10].map(j => <th key={j}>≥ {j}</th>)}</tr></thead>
          <tbody><tr><td>Probability</td>{[1, 2, 3, 5, 10].map(j => <td key={j}>{fmtP(ppoisUpper(j, gmExp))}</td>)}</tr></tbody>
        </table></div>
        <p className="hint">
          Each case counted as one random individual; a rough lower bound, as cases are chosen for candidate variants.
        </p>
        <details className="mme-nodes">
          <summary>Cases per node</summary>
          <table>
            <thead><tr><th>Node</th><th>Cases in MME</th></tr></thead>
            <tbody>{MME.nodes.map(n => <tr key={n.name}><td>{n.name}</td><td>{n.cases.toLocaleString()}</td></tr>)}</tbody>
          </table>
          <p className="hint">
            Source: <a href={MME.url} target="_blank" rel="noreferrer">Matchmaker Exchange statistics</a>, {MME.date}.
          </p>
        </details>
      </Panel>

      <ReportExport
        rows={rows} title={`Case series by chance: ${setName}`} titleGene={genes.length === 1 ? genes[0].gene : undefined} chartAfter="Result" chartRef={chartRef}
        fileStem={`case_series_${genes.map(g => g.gene).slice(0, 3).join('_')}${genes.length > 3 ? '_etc' : ''}`}
        legend={[
          genes.length === 1
            ? { italicLead: genes[0].gene, label: `, ${label}`, dash: 'solid', color: [47, 93, 138] }
            : { label: `${setName}, ${label}`, dash: 'solid', color: [47, 93, 138] },
          { label: `${baseLabel}, same variant type`, dash: 'dashed', color: [140, 140, 135] },
          { label: 'DDD (31,058 trios)', dash: 'dotted', color: [107, 107, 102] },
        ]}
        notes={[
          'Probabilities are per gene set as entered; correct for multiple testing if several genes or sets were considered.',
          'The number of individuals sequenced is an estimate; the chart shows how the probability depends on it.',
          'Chance is for unselected individuals; cases ascertained on a distinctive phenotype are less likely to be chance.',
          'Matchmaker Exchange: each case counted as one random individual; cases are chosen for candidate variants, so this is a lower bound.',
          'Autosomal SNVs only: indels and genes on X, Y or MT are not modelled.',
        ]}
      />
    </>
  )
}

function CaseChart({ k, N, mu, base }: { k: number; N: number; mu: number; base: number }) {
  const W = 720, H = 300, L = 52, R = 16, T = 14, B = 44
  const fast = Math.max(mu, base), slow = Math.min(mu, base)
  const x0 = Math.min(3, Math.floor(Math.log10(Math.min(N, individualsNeeded(k, fast, 0.01)))))
  const x1 = Math.max(8, Math.ceil(Math.log10(Math.max(N, individualsNeeded(k, slow, 0.5) * 20))))
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
        aria-label={`Probability of at least ${k} by chance against individuals sequenced`}>
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
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="ax lg">Individuals sequenced (log scale)</text>
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
