import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_N_DECODE, GENE_RATES, GENE_SETS, K_BY_BACKGROUND, RATE_GENE_INDEX } from './data/sources'
import { parseGeneList, resolveGeneList } from './lib/genesets'
import { ALL_GENES, CUSTOM, GeneSetPicker } from './components/GeneSetPicker'
import {
  BACKGROUNDS, BIN_LABELS, BINS, cohortScale, countsFromAges, countsFromNormal, expectedPerGene,
  LOF_DEFAULT,
} from './lib/model'
import type { Background, Consequence, GeneExpected, PerBin, Sites } from './lib/model'
import { readAges } from './lib/parse'
import { NormalAgeInput, TsvAgeInput } from './components/AgeInputs'
import type { NormalState, TsvState } from './components/AgeInputs'
import { CohortSummary } from './components/CohortSummary'
import type { Observed } from './components/ObservedTest'
import type { Alternative } from './lib/poisson'
import { GeneTable } from './components/GeneTable'
import { ModelOptions } from './components/ModelOptions'
import { About } from './components/About'
import { Panel, Segmented } from './components/ui'
import paradigmLogo from './assets/paradigm-logo.png'
import uoeLogo from './assets/uoe-logo.png'

type Mode = 'tsv' | 'normal'
type Page = 'calculator' | 'about'

// Pages switch in React state, not by following #links: email, Teams and SharePoint
// previews open the file in sandboxed frames where hash navigation can fail. The hash
// is still written when allowed, so #about links open the About page.
function pageFromHash(): Page {
  try { return window.location.hash === '#about' ? 'about' : 'calculator' } catch { return 'calculator' }
}

function usePage(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(pageFromHash)
  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (p: Page) => {
    setPage(p)
    window.scrollTo(0, 0)
    try {
      history.replaceState(null, '', p === 'about' ? '#about' : location.pathname + location.search)
    } catch { /* sandboxed: the page still switches */ }
  }
  return [page, go]
}
type Cohort = { counts: PerBin; n: number; description: string } | { error: string }

function resolveCohort(mode: Mode, ages: number[] | null, normal: NormalState): Cohort {
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

function downloadTsv(rows: GeneExpected[], header: string[]) {
  const lines = [
    ...header.map(h => '# ' + h),
    'gene\tchrom\texp_synonymous\texp_missense\texp_lof',
    ...rows.map(r => [r.gene, r.chrom, r.syn.toPrecision(6), r.mis.toPrecision(6), r.lof.toPrecision(6)].join('\t')),
  ]
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'expected_dnvs_per_gene.tsv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function App() {
  const [page, goTo] = usePage()
  const [mode, setMode] = useState<Mode>('normal')
  const [tsv, setTsv] = useState<TsvState>({ table: null, column: 0, text: '', fileName: null })
  const [normal, setNormal] = useState<NormalState>({ mean: '33', sd: '5.5', n: '1000' })
  const [background, setBackground] = useState<Background>('k_intergenic')
  const [sites, setSites] = useState<Sites>('hq')
  const [lof, setLof] = useState<Consequence[]>(LOF_DEFAULT)
  const [nDecode, setNDecode] = useState<PerBin>(DEFAULT_N_DECODE)
  const [geneSetId, setGeneSetId] = useState<string>(ALL_GENES)
  const [customText, setCustomText] = useState('')
  const [observed, setObserved] = useState<Observed>({ syn: '', mis: '', lof: '' })
  const [alternative, setAlternative] = useState<Alternative>('greater')

  const ageSummary = useMemo(() => (tsv.table ? readAges(tsv.table, tsv.column) : null), [tsv.table, tsv.column])
  const cohort = useMemo(
    () => resolveCohort(mode, ageSummary?.ages ?? null, normal),
    [mode, ageSummary, normal],
  )

  const k = K_BY_BACKGROUND[background]
  const badN = BINS.filter(b => !(nDecode[b] > 0))
  const error = 'error' in cohort ? cohort.error
    : badN.length ? `deCODE proband counts must be above zero (${badN.map(b => BIN_LABELS[b]).join(', ')}).`
    : null

  const perIndividualRate = useMemo(
    () => Object.fromEntries(BINS.map(b => [b, k[b] / nDecode[b]])) as PerBin,
    [k, nDecode],
  )
  const rows = useMemo(() => {
    if (error || 'error' in cohort) return []
    return expectedPerGene(GENE_RATES, cohortScale(cohort.counts, k, nDecode), sites, lof)
  }, [error, cohort, k, nDecode, sites, lof])
  const custom = useMemo(
    () => (geneSetId === CUSTOM ? resolveGeneList(parseGeneList(customText), RATE_GENE_INDEX, GENE_SETS.aliases) : null),
    [geneSetId, customText],
  )
  const geneSet = GENE_SETS.sets.find(s => s.id === geneSetId)
  const subset = useMemo(
    () => (geneSet ? new Set(geneSet.genes) : custom ? new Set(custom.genes) : null),
    [geneSet, custom],
  )
  const subsetRows = useMemo(() => (subset ? rows.filter(r => subset.has(r.gene)) : rows), [rows, subset])
  const scopeLabel = geneSet ? geneSet.label : custom ? 'custom list' : 'all genes'
  const scope = subset ? { label: scopeLabel, nGenes: subset.size } : null

  const totals = useMemo(
    () => subsetRows.reduce((t, r) => ({ syn: t.syn + r.syn, mis: t.mis + r.mis, lof: t.lof + r.lof }), { syn: 0, mis: 0, lof: 0 }),
    [subsetRows],
  )

  const onDownload = () => {
    if ('error' in cohort) return
    downloadTsv(subsetRows, [
      `gene set: ${scopeLabel}` + (geneSet ? ` (${geneSet.description}; ${geneSet.source})` : '') +
        (custom ? `; ${custom.genes.length} matched, not found: ${custom.unmatched.join(', ') || 'none'}` : ''),
      `paternal ages: ${cohort.description}`,
      `individuals per bin (${BINS.map(b => BIN_LABELS[b]).join(', ')}): ${BINS.map(b => +cohort.counts[b].toFixed(3)).join(', ')}`,
      `k background: ${BACKGROUNDS[background]}; deCODE probands per bin: ${BINS.map(b => nDecode[b]).join(', ')}`,
      `sites: ${sites === 'hq' ? 'high quality (high, TFBS)' : 'all'}; LoF = ${lof.join(' + ') || 'none'}`,
      'expected = summed roulette MR x sum_bin(n_bin x k_bin / N_deCODE_bin)',
    ])
  }

  return (
    <main>
      <header className="masthead">
        <div>
          <h1>Expected <i>de novo</i> SNVs per gene, scaled by paternal age</h1>
          <p className="sub">
            Roulette mutation rates summed per MANE gene, calibrated to deCODE trios binned by paternal age.
            Give your cohort's paternal ages to get expected synonymous, missense and LoF <i>de novo</i> variant counts for every gene.
          </p>
        </div>
        <div className="logos">
          <img src={paradigmLogo} alt="PARADIGM" height={44} />
          <img src={uoeLogo} alt="University of Exeter" height={44} />
        </div>
        <nav className="tabs" aria-label="Pages">
          <button type="button" aria-current={page === 'calculator' ? 'page' : undefined} onClick={() => goTo('calculator')}>
            Calculator
          </button>
          <button type="button" aria-current={page === 'about' ? 'page' : undefined} onClick={() => goTo('about')}>
            About
          </button>
        </nav>
      </header>

      {page === 'about' ? <About /> : <div className="grid">
        <div className="stack">
          <Panel title="Paternal ages">
            <Segmented<Mode>
              label="Age input" value={mode} onChange={setMode}
              options={[{ value: 'normal', label: 'Mean & SD' }, { value: 'tsv', label: 'Ages from TSV' }]}
            />
            {mode === 'normal'
              ? <NormalAgeInput value={normal} onChange={setNormal} />
              : <TsvAgeInput value={tsv} onChange={setTsv} summary={ageSummary} />}
            {error && <p className="err" role="alert">{error}</p>}
          </Panel>
          <Panel title="Model">
            <ModelOptions
              onAbout={() => goTo('about')}
              background={background} onBackground={setBackground}
              sites={sites} onSites={setSites}
              lof={lof} onLof={setLof}
              nDecode={nDecode} onNDecode={setNDecode}
            />
          </Panel>
          <Panel title="Gene set">
            <GeneSetPicker
              sets={GENE_SETS.sets} value={geneSetId} onChange={setGeneSetId}
              customText={customText} onCustomText={setCustomText} custom={custom}
              nGenes={GENE_RATES.length}
            />
          </Panel>
        </div>

        <div className="stack">
          {!error && !('error' in cohort) && (
            <Panel title="Cohort">
              <CohortSummary
                counts={cohort.counts} n={cohort.n} perIndividualRate={perIndividualRate}
                totals={totals} integerCounts={mode === 'tsv'} scope={scope}
                observed={observed} onObserved={setObserved}
                alternative={alternative} onAlternative={setAlternative}
              />
            </Panel>
          )}
          <Panel title={subset ? `Per gene · ${scopeLabel}` : 'Per gene'}>
            <GeneTable rows={subsetRows} onDownload={onDownload} />
          </Panel>
          <p className="prov">
            {GENE_RATES.length.toLocaleString()} genes. Roulette MR summed per MANE transcript, each site counted once per
            gene under its most severe consequence (gene_rates.tsv). k per paternal-age bin from
            scaling_factors_pat_only.tsv. Ages binned as &lt;25, 25–29, 30–34, 35–39, ≥40 on exact values.
          </p>
        </div>
      </div>}
    </main>
  )
}
