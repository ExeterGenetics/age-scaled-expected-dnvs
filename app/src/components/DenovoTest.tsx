import { useMemo } from 'react'
import { burden, BURDEN_CLASSES, FORMAT_LABELS, geneTests, parseDnvs, setBurden, SKIP_LABELS, TESTS_PER_GENE } from '../lib/denovo'
import type { BurdenClass, ClassTest, GeneResult, ParsedDnvs, SetComparison, Skip } from '../lib/denovo'
import type { GeneSet, ResolvedList } from '../lib/genesets'
import { splitUnmatched } from '../lib/genesets'
import { filterLabel, filterShares, MISSENSE_SCORES } from '../lib/missense'
import type { MissenseFilter } from '../lib/missense'
import type { GeneExpected } from '../lib/model'
import { count, fmtP, fmtR } from '../lib/format'
import { downloadText } from '../lib/report'
import { GENE_RATES, MISSENSE_BINS, NON_AUTOSOMAL } from '../data/sources'
import type { CohortModel, Mode } from '../useCohortModel'
import { NormalAgeInput, TsvAgeInput } from './AgeInputs'
import { ALL_GENES, CUSTOM, GeneSetPicker } from './GeneSetPicker'
import { ModelOptions } from './ModelOptions'
import { Field, Genes, OffAutosome, Panel, Renames, Segmented, useFileInput } from './ui'

export interface DenovoState {
  text: string
  fileName: string | null
  rescale: boolean
  setId: string       // gene set compared in the burden box (ALL_GENES: none)
  setCustom: string   // custom list text when setId is CUSTOM
}
export const DENOVO_DEFAULT: DenovoState = { text: '', fileName: null, rescale: false, setId: ALL_GENES, setCustom: '' }

const PLACEHOLDER = [
  'gene\tconsequence\tn',
  'ARID1B\tstop_gained\t1',
  'SCN2A\tmissense_variant\t2',
  '',
  'or: gene  N_syn  N_mis  N_lof',
].join('\n')
const MAX_ROWS = 300
const EXAMPLE_NAME = 'Kaplanis et al. 2020 example'
const EXAMPLE_N = 31058
const ALL_GENE_IDS = GENE_RATES.map(g => g.gene)

const fmtE = count
const pCell = (p: number | null) => (p === null ? '–' : fmtP(p))

interface Props {
  value: DenovoState
  onChange: (v: DenovoState) => void
  model: CohortModel   // this tab's own cohort and model settings
  resolve: (symbol: string) => string | undefined
  geneSets: GeneSet[]
  resolveList: (text: string) => ResolvedList
  onAbout: () => void
}

export function DenovoTest({ value, onChange, model: m, resolve, geneSets, resolveList, onAbout }: Props) {
  const result = useMemo(
    () => parseDnvs(value.text, m.lof, m.missense, resolve),
    [value.text, m.lof, m.missense, resolve],
  )
  const parsed = result && !('error' in result) ? result : null
  const shares = useMemo(
    () => (m.missense.score === 'none' ? null : filterShares(ALL_GENE_IDS, MISSENSE_BINS, m.missense, m.sites)),
    [m.missense, m.sites],
  )
  const { onFile, error: fileError } = useFileInput((text, fileName) => onChange({ ...value, text, fileName }))
  // inlined in the build but loaded only on request
  const onExample = async () => {
    const text = (await import('../../../data/examples/kaplanis2020_dnvs.tsv?raw')).default
    onChange({ ...value, text, fileName: EXAMPLE_NAME })
    m.setMode('normal')
    m.setNormal(v => ({ ...v, n: String(EXAMPLE_N) }))
  }

  return (
    <div className="grid">
      <div className="stack">
        <Panel title="Your de novo variants">
          <div className="example-row">
            <button type="button" className="btn secondary" onClick={onExample}>Load example: Kaplanis et al. 2020</button>
          </div>
          {value.fileName === EXAMPLE_NAME && (
            <p className="hint">
              45,221 <i>de novos</i> in {EXAMPLE_N.toLocaleString()} individuals with developmental disorders
              (<a href="https://doi.org/10.1038/s41586-020-2832-5" target="_blank" rel="noreferrer">Kaplanis et al. 2020</a>);
              cohort size set to match.
            </p>
          )}
          <Field label="TSV / CSV file (gzip is fine)">
            <input type="file" accept=".tsv,.csv,.txt,.gz,.bgz,text/*" onChange={onFile} />
          </Field>
          {fileError && <p className="err" role="alert">{fileError}</p>}
          <Field label="…or paste">
            <textarea className="dnv-in" spellCheck={false} placeholder={PLACEHOLDER}
              value={value.fileName ? '' : value.text}
              onChange={e => onChange({ ...value, text: e.target.value, fileName: null })} />
          </Field>
          <p className="hint">
            {value.fileName && value.fileName !== EXAMPLE_NAME && <><b>{value.fileName}</b> loaded. </>}
            One row per <i>de novo</i> (gene, consequence; optional count and score columns) or counts per gene.{' '}
            <button type="button" className="linklike" onClick={onAbout}>Formats</button>
          </p>
        </Panel>
        <Panel title="Paternal ages">
          <Segmented<Mode>
            label="Age input" value={m.mode} onChange={m.setMode}
            options={[{ value: 'normal', label: 'Mean & SD' }, { value: 'tsv', label: 'From TSV' }]}
          />
          {m.mode === 'normal'
            ? <NormalAgeInput value={m.normal} onChange={m.setNormal} />
            : <TsvAgeInput value={m.tsv} onChange={m.setTsv} summary={m.ageSummary} />}
          {m.error && <p className="err" role="alert">{m.error}</p>}
        </Panel>
        <Panel title="Model">
          <ModelOptions
            onAbout={onAbout}
            background={m.background} onBackground={m.setBackground}
            sites={m.sites} onSites={m.setSites}
            lof={m.lof} onLof={m.setLof}
            missense={m.missense} onMissense={m.setMissense} missenseShares={shares}
            nDecode={m.nDecode} onNDecode={m.setNDecode}
          />
        </Panel>
        {result && 'error' in result && (
          <Panel title="Input summary"><p className="err" role="alert">{result.error}</p></Panel>
        )}
        {parsed && <InputSummary parsed={parsed} missense={m.missense} />}
      </div>

      <div className="stack">
        {m.error ? (
          <Panel title="Report"><p className="err" role="alert">{m.error}</p></Panel>
        ) : !parsed || parsed.counted === 0 ? (
          <Panel title="Report">
            <p className="hint">{result ? 'No variants could be counted; see the input summary.' : 'Load or paste de novo variants to get a report.'}</p>
          </Panel>
        ) : (
          <Report parsed={parsed} expected={m.rows}
            rescale={value.rescale} onRescale={r => onChange({ ...value, rescale: r })} missense={m.missense}
            setId={value.setId} setCustom={value.setCustom} onSet={s => onChange({ ...value, ...s })}
            geneSets={geneSets} resolveList={resolveList} />
        )}
      </div>
    </div>
  )
}

function InputSummary({ parsed, missense }: { parsed: ParsedDnvs; missense: MissenseFilter }) {
  const skips = (Object.keys(SKIP_LABELS) as Skip[]).filter(k => parsed.skipped[k] > 0)
  const { offAutosome: offAuto, unknown } = splitUnmatched(parsed.unknownGenes, NON_AUTOSOMAL)
  return (
    <Panel title="Input summary">
      <p className="lede">
        <b>{parsed.counted.toLocaleString()}</b> <i>de novos</i> counted
        {parsed.format === 'counts' ? ` across ${parsed.rows.toLocaleString()} genes` : ` from ${parsed.rows.toLocaleString()} rows`}.
      </p>
      <p className="hint">Read as a {FORMAT_LABELS[parsed.format]}: {parsed.source}.</p>
      {skips.length > 0 && (
        <ul className="skips">
          {skips.map(k => <li key={k}><b>{parsed.skipped[k].toLocaleString()}</b> skipped: {SKIP_LABELS[k]}</li>)}
        </ul>
      )}
      {offAuto.length > 0 && (
        <p className="hint warn">
          {offAuto.length.toLocaleString()} genes not modelled, as rates are autosomal only: <OffAutosome genes={offAuto} max={5} />.
        </p>
      )}
      {unknown.length > 0 && (
        <p className="hint">
          Not found: <Genes list={unknown} max={5} />.
        </p>
      )}
      {parsed.renamed.length > 0 && (
        <p className="hint">
          {parsed.renamed.length} renamed from previous symbols (<Renames pairs={parsed.renamed} max={3} />).
        </p>
      )}
      {parsed.format === 'counts' && <p className="hint">{parsed.notes[0]}</p>}
      {missense.score !== 'none' && !parsed.scoreField && (
        <p className="hint warn">
          No {MISSENSE_SCORES[missense.score]} column, so all missense variants are counted: filter the input first or add
          the score.
        </p>
      )}
    </Panel>
  )
}

interface ReportProps {
  parsed: ParsedDnvs
  expected: GeneExpected[]
  rescale: boolean
  onRescale: (r: boolean) => void
  missense: MissenseFilter
  setId: string
  setCustom: string
  onSet: (s: Partial<Pick<DenovoState, 'setId' | 'setCustom'>>) => void
  geneSets: GeneSet[]
  resolveList: (text: string) => ResolvedList
}

function Report(props: ReportProps) {
  const { parsed, expected, rescale, onRescale, missense, setId, setCustom, onSet, geneSets, resolveList } = props
  const raw = useMemo(() => burden(parsed, expected, null), [parsed, expected])
  const syn = raw.syn
  const factor = rescale && syn && syn.observed > 0 ? syn.ratio : 1
  const scaled = useMemo(
    () => (factor === 1 ? expected
      : expected.map(g => ({ ...g, syn: g.syn * factor, mis: g.mis * factor, lof: g.lof * factor }))),
    [expected, factor],
  )
  const b = factor === 1 ? raw : burden(parsed, scaled, null)
  const nAll = expected.length
  const misName = filterLabel(missense) ? `Missense (${filterLabel(missense)})` : 'Missense'

  // gene set: burden inside vs outside, and the per-gene table restricted to it
  const chosenSet = geneSets.find(s => s.id === setId)
  const customList = useMemo(() => (setId === CUSTOM ? resolveList(setCustom) : null), [setId, setCustom, resolveList])
  const compareSet = useMemo(
    () => (chosenSet ? new Set(chosenSet.genes) : customList && customList.genes.length ? new Set(customList.genes) : null),
    [chosenSet, customList],
  )
  const cmp = useMemo(() => (compareSet ? setBurden(parsed, scaled, null, compareSet) : null), [parsed, scaled, compareSet])
  const setName = chosenSet?.label ?? 'custom list'
  const genes = useMemo(() => geneTests(parsed, scaled, compareSet), [parsed, scaled, compareSet])
  const allThreshold = 0.05 / (nAll * TESTS_PER_GENE)

  return (
    <>
      <Panel title="Synonymous check">
        {syn ? <SynCheck t={syn} /> : <p className="hint">No synonymous sites.</p>}
        <label className="check">
          <input type="checkbox" checked={rescale} disabled={!syn || syn.observed === 0}
            onChange={e => onRescale(e.target.checked)} />
          {' '}Rescale expectations by the synonymous O/E{syn && syn.observed > 0 ? ` (× ${fmtR(syn.ratio)})` : ''}
        </label>
      </Panel>

      <Panel title="Burden">
        <div className="scroll"><table>
          <thead><tr><th>Class</th><th>Observed</th><th>Expected</th><th>O/E (95% CI)</th><th>p</th></tr></thead>
          <tbody>
            <BurdenRow name="Synonymous" t={b.syn} note="two-sided" />
            <BurdenRow name={misName} t={b.mis} />
            <BurdenRow name="LoF" t={b.lof} />
            <BurdenRow name="Protein-altering" t={b.prot} />
          </tbody>
        </table></div>
        <p className="hint">
          Exact Poisson, one-sided except synonymous, over {nAll.toLocaleString()} genes
          {factor !== 1 && <>; expectations × {fmtR(factor)}</>}.
        </p>
        <div className="set-burden">
          <GeneSetPicker
            sets={geneSets} value={setId} onChange={id => onSet({ setId: id })}
            customText={setCustom} onCustomText={t => onSet({ setCustom: t })} custom={customList}
            nGenes={nAll} label="Gene set (burden inside vs outside; also filters the per-gene table)" noneLabel="None"
          />
          {cmp && <SetTable cmp={cmp} setName={setName} misName={misName} />}
        </div>
      </Panel>

      <GenePanel genes={genes.genes} nGenes={genes.nGenes} threshold={genes.threshold} misName={misName}
        factor={factor} setName={compareSet ? setName : null} nAll={nAll} allThreshold={allThreshold} />
    </>
  )
}

function SetTable({ cmp, setName, misName }: { cmp: SetComparison; setName: string; misName: string }) {
  const names: Record<BurdenClass, string> = { syn: 'Synonymous', mis: misName, lof: 'LoF', prot: 'Protein-altering' }
  const cells = (t: ClassTest | null, twoSided: boolean) => t
    ? <><td>{t.observed}</td><td>{fmtE(t.expected)}</td><td>{fmtR(t.ratio)} ({fmtR(t.ci[0])}–{fmtR(t.ci[1])})</td>
      <td className={!twoSided && t.p < 0.05 ? 'sig' : undefined}>{fmtP(t.p)}</td></>
    : <td colSpan={4}>no expected sites</td>
  return (
    <>
      <div className="scroll"><table className="set-table">
        <thead>
          <tr>
            <th rowSpan={2}>Class</th>
            <th colSpan={4}>In {setName} ({cmp.nInside.toLocaleString()} genes)</th>
            <th colSpan={4}>Outside ({cmp.nOutside.toLocaleString()} genes)</th>
            <th colSpan={2}>In vs outside</th>
          </tr>
          <tr>
            <th>obs</th><th>exp</th><th>O/E (95% CI)</th><th>p</th>
            <th>obs</th><th>exp</th><th>O/E (95% CI)</th><th>p</th>
            <th>ratio</th><th>p</th>
          </tr>
        </thead>
        <tbody>
          {BURDEN_CLASSES.map(c => (
            <tr key={c}>
              <td>{names[c]}</td>
              {cells(cmp.inside[c], c === 'syn')}
              {cells(cmp.outside[c], c === 'syn')}
              <td>{cmp.ratio[c] === null ? '–' : fmtR(cmp.ratio[c]!)}</td>
              <td className={cmp.p[c] !== null && cmp.p[c]! < 0.05 && c !== 'syn' ? 'sig' : undefined}>{pCell(cmp.p[c])}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="hint">In vs outside: ratio of the O/Es, one-sided exact binomial test.</p>
    </>
  )
}

function SynCheck({ t }: { t: ClassTest }) {
  const inside = t.ci[0] <= 1 && 1 <= t.ci[1]
  return (
    <>
      <p className="lede">
        <b>{t.observed.toLocaleString()}</b> observed, <b>{fmtE(t.expected)}</b> expected: O/E <b>{fmtR(t.ratio)}</b>
        {' '}(95% CI {fmtR(t.ci[0])}–{fmtR(t.ci[1])}), p = {fmtP(t.p)}.
      </p>
      <p className={inside ? 'hint' : 'hint warn'}>
        {inside ? 'Consistent with 1: the expectations fit this cohort.'
          : t.ratio < 1
            ? 'Below 1: lower detection, or the cohort size or ages are off. Enrichment will be understated.'
            : 'Above 1: false positives, or the cohort size or ages are off. Enrichment will be overstated.'}
      </p>
    </>
  )
}

function BurdenRow({ name, t, note }: { name: string; t: ClassTest | null; note?: string }) {
  if (!t) return <tr><td>{name}</td><td colSpan={4}>no expected sites</td></tr>
  return (
    <tr>
      <td>{name}</td>
      <td>{t.observed.toLocaleString()}</td>
      <td>{fmtE(t.expected)}</td>
      <td>{fmtR(t.ratio)} ({fmtR(t.ci[0])}–{fmtR(t.ci[1])})</td>
      <td className={t.p < 0.05 ? 'sig' : undefined}>{fmtP(t.p)}{note ? ` (${note})` : ''}</td>
    </tr>
  )
}

interface GenePanelProps {
  genes: GeneResult[]; nGenes: number; threshold: number; misName: string; factor: number
  setName: string | null   // the table is restricted to this gene set
  nAll: number             // all genes, for the stricter threshold
  allThreshold: number
}

function GenePanel({ genes, nGenes, threshold, misName, factor, setName, nAll, allThreshold }: GenePanelProps) {
  const nSig = genes.filter(g => g.significant).length
  const nAllSig = genes.filter(g => g.pMin < allThreshold).length
  const download = () => {
    const lines = [
      `# exact Poisson, one-sided; Bonferroni threshold ${threshold.toExponential(3)} = 0.05 / (${nGenes} genes x ${TESTS_PER_GENE} tests: LoF, protein-altering)` +
        (setName ? `; threshold over all ${nAll} genes ${allThreshold.toExponential(3)}` : ''),
      `# genes: ${setName ?? 'all'}; missense: ${misName}${factor !== 1 ? `; expectations rescaled by synonymous O/E ${factor.toPrecision(4)}` : ''}`,
      ['gene', 'chrom', 'obs_lof', 'exp_lof', 'p_lof', 'obs_mis', 'exp_mis', 'p_mis', 'obs_prot', 'exp_prot', 'p_prot', 'obs_syn', 'exp_syn', 'significant'].join('\t'),
      ...genes.map(g => [
        g.gene, g.chrom, g.obs.lof, g.exp.lof.toPrecision(4), g.pLof ?? 'NA', g.obs.mis, g.exp.mis.toPrecision(4), g.pMis ?? 'NA',
        g.obs.lof + g.obs.mis, g.exp.prot.toPrecision(4), g.pProt ?? 'NA', g.obs.syn, g.exp.syn.toPrecision(4), g.significant ? 1 : 0,
      ].join('\t')),
    ]
    downloadText(lines.join('\n') + '\n', 'denovo_gene_tests.tsv', 'text/tab-separated-values')
  }
  return (
    <Panel title={setName ? `Per gene · ${setName}` : 'Per gene'}>
      <div className="dnv-head">
        <p className="lede">
          <b>{nSig}</b> of {genes.length.toLocaleString()} genes pass p &lt; {fmtP(threshold)}
          {' '}(0.05 / {nGenes.toLocaleString()} genes × {TESTS_PER_GENE})
          {setName && <>; {nAllSig} pass the all-gene threshold</>}.
        </p>
        <button type="button" className="btn" onClick={download}>Download TSV</button>
      </div>
      <div className="scroll dnv-genes-wrap"><table className="dnv-genes">
        <thead>
          <tr><th rowSpan={2}>Gene</th><th colSpan={3}>LoF</th><th colSpan={3}>{misName}</th><th colSpan={3}>Protein-altering</th></tr>
          <tr><th>obs</th><th>exp</th><th>p</th><th>obs</th><th>exp</th><th>p</th><th>obs</th><th>exp</th><th>p</th></tr>
        </thead>
        <tbody>
          {genes.slice(0, MAX_ROWS).map(g => (
            <tr key={g.gene} className={g.significant ? 'sig-row' : undefined}>
              <td><i>{g.gene}</i></td>
              <td>{g.obs.lof}</td><td>{fmtE(g.exp.lof)}</td><td>{pCell(g.pLof)}</td>
              <td>{g.obs.mis}</td><td>{fmtE(g.exp.mis)}</td><td>{pCell(g.pMis)}</td>
              <td>{g.obs.lof + g.obs.mis}</td><td>{fmtE(g.exp.prot)}</td><td>{pCell(g.pProt)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {genes.length > MAX_ROWS && (
        <p className="hint">Top {MAX_ROWS} shown; the download has all {genes.length.toLocaleString()}.</p>
      )}
    </Panel>
  )
}
