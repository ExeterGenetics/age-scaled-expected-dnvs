import { useEffect, useMemo, useState } from 'react'
import { GENE_RATES, GENE_SETS, MISSENSE_BINS, RATE_GENE_INDEX } from './data/sources'
import { filterLabel, filterShares, filterShortLabel, poorlyScoredGenes } from './lib/missense'
import { parseGeneList, resolveGeneList } from './lib/genesets'
import { ALL_GENES, CUSTOM, GeneSetPicker } from './components/GeneSetPicker'
import { BACKGROUNDS, BIN_LABELS, BINS, rateAtAge } from './lib/model'
import type { GeneExpected, PerBin } from './lib/model'
import { readAges } from './lib/parse'
import { MeanAgeInput, TsvAgeInput } from './components/AgeInputs'
import type { TsvState } from './components/AgeInputs'
import type { CaseAgeMode } from './components/CaseSeries'
import { useCohortModel } from './useCohortModel'
import { downloadText } from './lib/report'
import { caseLinkQuery, decodeCaseLink, encodeCaseLink } from './lib/share'
import type { Mode } from './useCohortModel'
import { CohortSummary } from './components/CohortSummary'
import type { Observed } from './components/ObservedTest'
import type { Alternative } from './lib/poisson'
import { GeneTable } from './components/GeneTable'
import { ModelOptions } from './components/ModelOptions'
import { About } from './components/About'
import { CASE_DEFAULT, CaseSeries } from './components/CaseSeries'
import { DENOVO_DEFAULT, DenovoTest } from './components/DenovoTest'
import type { DenovoState } from './components/DenovoTest'
import type { CaseState } from './components/CaseSeries'
import { Panel, Segmented } from './components/ui'
import paradigmLogo from './assets/paradigm-logo.png'
import uoeLogo from './assets/uoe-logo.png'

type Page = 'calculator' | 'case-series' | 'test' | 'about'
const HASHES: Partial<Record<Page, string>> = { about: '#about', 'case-series': '#case-series', test: '#test' }

// symbol in a pasted variant list -> gene_rates symbol, directly or via a previous/alias symbol
const resolveSymbol = (s: string) => RATE_GENE_INDEX.get(s.toUpperCase()) ?? GENE_SETS.aliases[s.toUpperCase()]
// pasted gene list -> gene_rates symbols, with renames and misses
const resolveList = (text: string) => resolveGeneList(parseGeneList(text), RATE_GENE_INDEX, GENE_SETS.aliases)

// Pages switch in React state, not by following #links: email, Teams and SharePoint
// previews open the file in sandboxed frames where hash navigation can fail. The hash
// is still written when allowed, so #about and #case-series links open those pages.
function pageFromHash(): Page {
  try {
    const h = window.location.hash.split('?')[0]  // a shared link adds ?inputs after the page
    return (Object.keys(HASHES) as Page[]).find(p => HASHES[p] === h) ?? 'calculator'
  } catch { return 'calculator' }
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
      history.replaceState(null, '', HASHES[p] ?? location.pathname + location.search)
    } catch { /* sandboxed: the page still switches */ }
  }
  return [page, go]
}
// unscored: genes flagged by poorlyScoredGenes, written as an extra column when a filter is on
function downloadTsv(rows: GeneExpected[], header: string[], unscored: Set<string> | null) {
  const lines = [
    ...header.map(h => '# ' + h),
    'gene\tchrom\texp_synonymous\texp_missense\texp_lof' + (unscored ? '\tmissense_mostly_unscored' : ''),
    ...rows.map(r => [r.gene, r.chrom, r.syn.toPrecision(6), r.mis.toPrecision(6), r.lof.toPrecision(6),
      ...(unscored ? [unscored.has(r.gene) ? '1' : '0'] : [])].join('\t')),
  ]
  downloadText(lines.join('\n') + '\n', 'expected_dnvs_per_gene.tsv', 'text/tab-separated-values')
}

export function App() {
  const [page, goTo] = usePage()
  // Calculator cohort and model, also used by the Case series tab; the de novo tab has its own
  // inputs from a shared Case series link, read once
  const [link] = useState(() => {
    try { const q = caseLinkQuery(window.location.hash); return q ? decodeCaseLink(q) : {} } catch { return {} }
  })
  const calc = useCohortModel(true, link)
  const dnv = useCohortModel(page === 'test')
  const {
    mode, setMode, tsv, setTsv, meanInput, setMeanInput, background, setBackground, sites, setSites,
    lof, setLof, nDecode, missense, setMissense, rates, ageSummary, cohort, k, linearFit, error, rows,
  } = calc
  const [geneSetId, setGeneSetId] = useState<string>(ALL_GENES)
  const [customText, setCustomText] = useState('')
  const [observed, setObserved] = useState<Observed>({ syn: '', mis: '', lof: '' })
  const [alternative, setAlternative] = useState<Alternative>('greater')
  const [caseState, setCaseState] = useState<CaseState>(() => ({
    ...CASE_DEFAULT,
    ...Object.fromEntries((['genesText', 'cons', 'k', 'log10N', 'matches'] as const).filter(f => link[f] !== undefined).map(f => [f, link[f]])),
  }))
  const [denovo, setDenovo] = useState<DenovoState>(DENOVO_DEFAULT)
  const misQualifier = filterLabel(missense)

  const perIndividualRate = useMemo(
    () => Object.fromEntries(BINS.map(b => [b, k[b] / nDecode[b]])) as PerBin,
    [k, nDecode],
  )
  // Case series: per-individual rate for a paternal age, deCODE's own mean (30.3 yr) by default
  const [caseAgeMode, setCaseAgeMode] = useState<CaseAgeMode>(link.ages?.mode ?? 'decode')
  const [caseMean, setCaseMean] = useState<string>(
    link.ages?.mode === 'mean' ? link.ages.mean : '33',
  )
  const [caseTsv, setCaseTsv] = useState<TsvState>({ table: null, column: 0, text: '', fileName: null })
  const caseAgeSummary = useMemo(() => (caseTsv.table ? readAges(caseTsv.table, caseTsv.column) : null), [caseTsv.table, caseTsv.column])
  const caseAges = useMemo((): { meanAge: number; description: string } | { error: string } => {
    if (caseAgeMode === 'decode') {
      const m = linearFit?.meanAge ?? 30.34
      return {
        meanAge: m,
        description: `deCODE average paternal age (${m.toFixed(1)} yr; ${BINS.map(b => `${BIN_LABELS[b]}: ${nDecode[b].toLocaleString()}`).join(', ')} probands)`,
      }
    }
    if (caseAgeMode === 'mean') {
      const mean = parseFloat(caseMean)
      if (!Number.isFinite(mean) || mean <= 0) return { error: 'Enter a mean paternal age above zero.' }
      return { meanAge: mean, description: `mean paternal age ${mean} yr` }
    }
    const ages = caseAgeSummary?.ages ?? []
    if (ages.length === 0) return { error: 'Load or paste paternal ages.' }
    const meanAge = ages.reduce((a, b) => a + b, 0) / ages.length
    return {
      meanAge,
      description: `${ages.length} paternal ages from TSV (mean ${meanAge.toFixed(2)} yr)`,
    }
  }, [caseAgeMode, caseMean, caseAgeSummary, nDecode, linearFit])
  const caseError = 'error' in caseAges ? caseAges.error : null
  const perIndividualScale = caseError || 'error' in caseAges ? null : rateAtAge(caseAges.meanAge, linearFit)
  const custom = useMemo(
    () => (geneSetId === CUSTOM ? resolveGeneList(parseGeneList(customText), RATE_GENE_INDEX, GENE_SETS.aliases) : null),
    [geneSetId, customText],
  )
  const geneSet = GENE_SETS.sets.find(s => s.id === geneSetId)
  const subset = useMemo(
    () => (geneSet ? new Set(geneSet.genes) : custom ? new Set(custom.genes) : null),
    [geneSet, custom],
  )
  const missenseShares = useMemo(
    () => (missense.score === 'none' ? null
      : filterShares(subset ?? GENE_RATES.map(g => g.gene), MISSENSE_BINS, missense, sites)),
    [missense, subset, sites],
  )
  const unscored = useMemo(
    () => (missense.score === 'none' ? null : poorlyScoredGenes(MISSENSE_BINS, missense, sites)),
    [missense, sites],
  )
  const subsetRows = useMemo(() => (subset ? rows.filter(r => subset.has(r.gene)) : rows), [rows, subset])
  const scopeLabel = geneSet ? geneSet.label : custom ? 'custom list' : 'all genes'
  const scope = subset ? { label: scopeLabel, nGenes: subset.size } : null

  const totals = useMemo(
    () => subsetRows.reduce((t, r) => ({ syn: t.syn + r.syn, mis: t.mis + r.mis, lof: t.lof + r.lof }), { syn: 0, mis: 0, lof: 0 }),
    [subsetRows],
  )

  const onDownload = () => {
    if ('error' in cohort || !linearFit) return
    downloadTsv(subsetRows, [
      `gene set: ${scopeLabel}` + (geneSet ? ` (${geneSet.description}; ${geneSet.source})` : '') +
        (custom ? `; ${custom.genes.length} matched, not found: ${custom.unmatched.join(', ') || 'none'}` : ''),
      `paternal ages: ${cohort.description}`,
      `k background: ${BACKGROUNDS[background]}; linear fit s(age) = ${linearFit.alpha.toExponential(4)} + ${linearFit.beta.toExponential(4)} * age (R^2 = ${linearFit.r2.toFixed(4)})`,
      `deCODE probands per bin (${BINS.map(b => BIN_LABELS[b]).join(', ')}): ${BINS.map(b => nDecode[b]).join(', ')}`,
      `sites: ${sites === 'hq' ? 'high quality (high, TFBS)' : 'all'}; LoF = ${lof.join(' + ') || 'none'}`,
      `missense: ${misQualifier ? `${misQualifier} (sites without a score excluded; missense_mostly_unscored = 1 where under half the gene's missense rate is scored)` : 'all missense sites'}`,
      'expected = summed roulette MR x N x (alpha + beta x mean_paternal_age)',
    ], unscored)
  }

  return (
    <main>
      <header className="masthead">
        <div>
          <h1>Expected <i>de novo</i> SNVs per gene, scaled by paternal age</h1>
          <p className="sub">
            Expected synonymous, missense and LoF <i>de novo</i> SNVs per gene for your cohort's paternal ages, from Roulette
            rates calibrated to deCODE trios. <span className="privacy">Runs in your browser: nothing you enter or load is uploaded.</span>
          </p>
        </div>
        <div className="logos">
          <img src={paradigmLogo} alt="PARADIGM" height={44} />
          <img src={uoeLogo} alt="University of Exeter" height={44} />
        </div>
        <nav className="tabs" aria-label="Pages">
          <button type="button" aria-current={page === 'calculator' ? 'page' : undefined} onClick={() => goTo('calculator')}>
            Expected counts
          </button>
          <button type="button" aria-current={page === 'case-series' ? 'page' : undefined} onClick={() => goTo('case-series')}>
            Case series by chance
          </button>
          <button type="button" aria-current={page === 'test' ? 'page' : undefined} onClick={() => goTo('test')}>
            Test your de novos
          </button>
          <button type="button" aria-current={page === 'about' ? 'page' : undefined} onClick={() => goTo('about')}>
            About
          </button>
        </nav>
      </header>

      {page === 'about' ? <About /> : page === 'test' ? (
        <DenovoTest
          value={denovo} onChange={setDenovo} model={dnv}
          resolve={resolveSymbol} onAbout={() => goTo('about')}
          geneSets={GENE_SETS.sets} resolveList={resolveList}
        />
      ) : page === 'case-series' ? (
        <CaseSeries
          value={caseState} onChange={setCaseState}
          scale={perIndividualScale} cohortError={caseError}
          cohortDescription={'error' in caseAges ? '' : caseAges.description}
          shareLink={() => `${window.location.href.split('#')[0]}#case-series?${encodeCaseLink({
            ...caseState, missense, lof, sites, background,
            ages: caseAgeMode === 'mean' ? { mode: 'mean', mean: caseMean } : { mode: 'decode' },
          })}`}
          shareNote={caseAgeMode === 'tsv' ? "Ages from a TSV are not in the link; it opens with deCODE's average paternal age." : null}
          modelSummary={`${BACKGROUNDS[background].replace(/ \(.*\)/, '').toLowerCase()} background, ${sites === 'hq' ? 'high-quality sites' : 'all sites'}, LoF = ${lof.map(c => c.replace('_', ' ')).join(', ') || 'none'}`}
          modelDescription={`${BACKGROUNDS[background]} calibration background (continuous linear paternal-age fit); deCODE probands per bin ${BINS.map(b => `${BIN_LABELS[b]} ${nDecode[b]}`).join(', ')}`}
          ages={{
            mode: caseAgeMode, onMode: setCaseAgeMode, mean: caseMean, onMean: setCaseMean,
            tsv: caseTsv, onTsv: setCaseTsv, summary: caseAgeSummary,
            resolvedMean: 'error' in caseAges ? null : caseAges.meanAge,
            linearFit, perIndividualRate,
          }}
          sites={sites} lof={lof} onCalculator={() => goTo('calculator')}
          rates={rates} missense={missense} onMissense={setMissense}
        />
      ) : <div className="grid results-first">
        <div className="stack">
          <Panel title="Paternal ages">
            <Segmented<Mode>
              label="Age input" value={mode} onChange={setMode}
              options={[{ value: 'mean', label: 'Mean age' }, { value: 'tsv', label: 'From TSV' }]}
            />
            {mode === 'mean'
              ? <MeanAgeInput value={meanInput} onChange={setMeanInput} />
              : <TsvAgeInput value={tsv} onChange={setTsv} summary={ageSummary} />}
            {error && <p className="err" role="alert">{error}</p>}
          </Panel>
          <Panel title="Model">
            <ModelOptions
              onAbout={() => goTo('about')}
              background={background} onBackground={setBackground}
              sites={sites} onSites={setSites}
              lof={lof} onLof={setLof}
              missense={missense} onMissense={setMissense} missenseShares={missenseShares}
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
                meanAge={cohort.meanAge} cohortAges={mode === 'tsv' ? (ageSummary?.ages ?? null) : null} n={cohort.n}
                perIndividualRate={perIndividualRate} linearFit={linearFit}
                totals={totals} scope={scope}
                observed={observed} onObserved={setObserved}
                alternative={alternative} onAlternative={setAlternative}
                misQualifier={filterShortLabel(missense)}
              />
            </Panel>
          )}
          <Panel title={subset ? `Per gene · ${scopeLabel}` : 'Per gene'}>
            <GeneTable rows={subsetRows} onDownload={onDownload} misQualifier={filterShortLabel(missense)} unscored={unscored ?? undefined} />
          </Panel>
        </div>
      </div>}
    </main>
  )
}
