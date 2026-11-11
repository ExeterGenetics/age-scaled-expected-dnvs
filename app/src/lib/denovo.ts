// Test a cohort's observed de novo variants against the age-scaled expectations, in the
// manner of denovolyzeR: burden per variant class across genes, and a Poisson test per gene.
// The rate model covers SNVs only, so indels (frameshift, inframe) are counted but not tested.

import { lgamma, poissonTest } from './poisson'
import type { PoissonTest } from './poisson'
import type { Consequence, GeneExpected } from './model'
import type { MissenseFilter } from './missense'

export type DnvClass = 'syn' | 'mis' | 'lof'
export type Counts = Record<DnvClass, number>
const zero = (): Counts => ({ syn: 0, mis: 0, lof: 0 })

// why a variant was not counted
export type Skip = 'notSnv' | 'lofNotSelected' | 'otherConsequence' | 'belowScore' | 'noScore' | 'unknownGene' | 'badCount'
export const SKIP_LABELS: Record<Skip, string> = {
  badCount: 'rows whose count is not a whole number',
  notSnv: 'indels (frameshift, inframe): the rate model covers SNVs only',
  lofNotSelected: 'LoF consequences not selected in the model settings',
  otherConsequence: 'other consequences (splice region, UTR, intronic, …)',
  belowScore: 'missense below the score threshold',
  noScore: 'missense with no score',
  unknownGene: 'genes not in the rate table (autosomal protein-coding only)',
}

// consequence terms: VEP/bcftools names with or without "_variant", plus denovolyzeR's
// class names (syn, mis, non, splice, frameshift, lof)
const NOT_SNV = /^(frameshift|inframe_insertion|inframe_deletion|indel|frameshift_insertion|frameshift_deletion|frameshift_elongation|frameshift_truncation|feature_elongation|feature_truncation)$/
const LOF_TERMS: Record<string, Consequence | 'any' | 'splice'> = {
  splice_acceptor: 'splice_acceptor', splice_donor: 'splice_donor', stop_gained: 'stop_gained',
  start_lost: 'start_lost', stop_lost: 'stop_lost',
  nonsense: 'stop_gained', non: 'stop_gained', stopgain: 'stop_gained', stop_gain: 'stop_gained',
  start_loss: 'start_lost', stoploss: 'stop_lost', stop_loss: 'stop_lost',
  initiator_codon: 'start_lost',  // VEP's former name for start_lost
  splice: 'splice', canonical_splice: 'splice', essential_splice: 'splice',
  lof: 'any', ptv: 'any', plof: 'any',
}
const MIS_TERMS = /^(missense|mis|nonsynonymous|nonsynonymous_snv|non_synonymous|non_synonymous_coding)$/
const SYN_TERMS = /^(synonymous|syn|silent|synonymous_snv|synonymous_coding)$/

export function classify(raw: string, lof: Consequence[]): DnvClass | Skip {
  const terms = raw.toLowerCase().split(/[&,|;/+\s]+/)
    .map(t => t.replace(/^\*/, '').replace(/_variant$/, '')).filter(Boolean)
  if (terms.some(t => NOT_SNV.test(t))) return 'notSnv'
  const lofHits = terms.map(t => LOF_TERMS[t]).filter(Boolean)
  if (lofHits.length) {
    const selected = lofHits.some(h =>
      h === 'any' || (h === 'splice' ? lof.includes('splice_donor') || lof.includes('splice_acceptor') : lof.includes(h)))
    if (selected) return 'lof'
    // an unselected LoF class is not counted even with a missense term on the same variant:
    // the rate table files each site under its most severe consequence, so that site's rate
    // is in neither the missense nor the LoF expectation
    return 'lofNotSelected'
  }
  if (terms.some(t => MIS_TERMS.test(t))) return 'mis'
  if (terms.some(t => SYN_TERMS.test(t))) return 'syn'
  return 'otherConsequence'
}

export type InputFormat = 'counts' | 'list'
export const FORMAT_LABELS: Record<InputFormat, string> = {
  counts: 'table of counts per gene',
  list: 'list of de novos (gene and consequence)',
}

export interface ParsedDnvs {
  format: InputFormat
  source: string               // fields read, for the input summary
  byGene: Map<string, Counts>  // rate-table symbol -> counts
  rows: number                 // table rows read
  counted: number              // de novos counted
  skipped: Record<Skip, number>
  unknownGenes: string[]
  renamed: [string, string][]
  scoreField: string | null    // column or field used for the missense score filter
  notes: string[]              // format-specific caveats
}
export type ParseResult = ParsedDnvs | { error: string } | null

// when a record counts in no gene, report the most informative reason
const SKIP_RANK: Skip[] = ['badCount', 'belowScore', 'noScore', 'lofNotSelected', 'unknownGene', 'otherConsequence', 'notSnv']
function worse(a: Skip | null, b: Skip): Skip {
  return a === null || SKIP_RANK.indexOf(b) < SKIP_RANK.indexOf(a) ? b : a
}

// Collects counts per gene and the reasons records were not counted.
export class Tally {
  byGene = new Map<string, Counts>()
  skipped = Object.fromEntries(Object.keys(SKIP_LABELS).map(k => [k, 0])) as Record<Skip, number>
  counted = 0
  private unknown = new Set<string>()
  private renamed = new Map<string, string>()
  private resolve: (symbol: string) => string | undefined
  constructor(resolve: (symbol: string) => string | undefined) { this.resolve = resolve }

  // add one record's class per gene (n copies); when nothing counts, record why
  record(perGene: [string, DnvClass | Skip][], n = 1): boolean {
    let added = false
    let why: Skip | null = null
    for (const [symbol, cls] of perGene) {
      if (cls !== 'syn' && cls !== 'mis' && cls !== 'lof') { why = worse(why, cls); continue }
      const g = this.resolve(symbol)
      if (!g) { this.unknown.add(symbol); why = worse(why, 'unknownGene'); continue }
      if (g.toUpperCase() !== symbol.toUpperCase()) this.renamed.set(symbol, g)
      const c = this.byGene.get(g) ?? zero()
      c[cls] += n
      this.byGene.set(g, c)
      added = true
    }
    if (added) this.counted += n
    else this.skipped[why ?? 'otherConsequence'] += n
    return added
  }

  result(format: InputFormat, source: string, rows: number, scoreField: string | null, notes: string[] = []): ParsedDnvs {
    return {
      format, source, rows, scoreField, notes, byGene: this.byGene, counted: this.counted,
      skipped: this.skipped, unknownGenes: [...this.unknown], renamed: [...this.renamed],
    }
  }
}

// Applies the missense score filter to a missense call given the record's score values
// (null: no score column, so the call stands).
export function scoreCheck(cls: DnvClass | Skip, values: string[] | null, filter: MissenseFilter): DnvClass | Skip {
  if (cls !== 'mis' || values === null || filter.score === 'none') return cls
  const v = values.flatMap(x => x.split(/[,;&|]/)).map(x => x.trim()).filter(x => x !== '' && x !== '.' && x !== '-')
    .map(Number).filter(Number.isFinite)
  if (v.length === 0) return 'noScore'
  return Math.max(...v) < filter.threshold - 1e-9 ? 'belowScore' : 'mis'
}

// column or annotation field holding the active score: exact names first; never rank
// scores or predicted classes
const SCORE_FIELDS: Record<'am' | 'revel', RegExp[]> = {
  am: [/^am_pathogenicity$/i, /^alphamissense(_score)?$/i, /^am(_score)?$/i, /alpha.?missense/i],
  revel: [/^revel(_score)?$/i, /revel/i],
}
export function findScoreField(names: string[], filter: MissenseFilter): number {
  if (filter.score === 'none') return -1
  for (const re of SCORE_FIELDS[filter.score]) {
    const i = names.findIndex(n => re.test(n) && !/rank|class|pred/i.test(n))
    if (i >= 0) return i
  }
  return -1
}

const GENE_HEAD = /^(gene|genes|symbol|gene_symbol|hgnc_symbol|gene_name|genename)$/i
const CSQ_HEAD = /consequence|csq|^class$|effect|^type$|annotation|variant_class|func/i
const COUNT_HEAD: Record<DnvClass, RegExp> = {
  syn: /^(n_?|obs_?)?(syn|synonymous)(_?(n|count|obs))?$/i,
  mis: /^(n_?|obs_?)?(mis|missense)(_?(n|count|obs))?$/i,
  lof: /^(n_?|obs_?)?(lof|ptv|plof)(_?(n|count|obs))?$/i,
}
const isCount = (v: string | undefined) => v !== undefined && /^\d+$/.test(v)
// gene column: symbol-style names first ('symbol' before 'gene'), skipping one that holds
// Ensembl IDs when another candidate exists
const GENE_PRIORITY = [/^(symbol|gene_symbol|hgnc_symbol)$/i, /^(gene_name|genename)$/i, /^(gene|genes)$/i]
function pickGeneColumn(header: string[], rows: string[][]): number {
  const cands = GENE_PRIORITY.flatMap(re => header.map((h, i) => (re.test(h) ? i : -1)).filter(i => i >= 0))
  const ensembl = (i: number) => {
    const vals = rows.slice(0, 50).map(r => r[i] ?? '').filter(Boolean)
    return vals.length > 0 && vals.filter(v => /^ENS[GT]\d/i.test(v)).length > vals.length / 2
  }
  return cands.find(i => !ensembl(i)) ?? cands[0] ?? 0
}
const N_HEAD = /^(n|count|n_?dnvs?|n_?carriers|carriers|n_?probands|probands)$/i

// Tables: a list of variants (gene, consequence, optional score) or counts per gene
// (gene, N_syn, N_mis, N_lof), tab, comma or whitespace separated, header optional.
export function parseTable(
  lines: string[], lof: Consequence[], filter: MissenseFilter, resolve: (s: string) => string | undefined,
): ParsedDnvs {
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : /\s+/
  // tab or comma: split the raw line so empty cells keep their place; whitespace: trim first
  let rows = lines.map(l => (sep instanceof RegExp ? l.trim() : l.replace(/\r$/, ''))
    .split(sep).map(v => v.trim().replace(/^["']|["']$/g, '')))
  const first = rows[0]
  const hasGeneHead = first.some(v => GENE_HEAD.test(v))
  const isHeader = hasGeneHead || first.some(v => CSQ_HEAD.test(v))
  const header = isHeader ? first : null
  if (header) rows = rows.slice(1)
  const find = (re: RegExp, fallback: number) => {
    const i = header ? header.findIndex(h => re.test(h)) : -1
    return i >= 0 ? i : fallback
  }
  const gi = header ? pickGeneColumn(header, rows) : 0
  const t = new Tally(resolve)

  // counts per gene: named count columns holding whole numbers, with a gene column and no
  // consequence column (so a list with a LoF flag or LOFTEE HC/LC column stays a list), or
  // gene then three counts without a header
  const allCounts = (i: number) => rows.every(r => (r[i] ?? '') === '' || isCount(r[i]))
  const named = (Object.keys(COUNT_HEAD) as DnvClass[])
    .map(k => [k, hasGeneHead && !first.some(v => CSQ_HEAD.test(v)) ? first.findIndex(h => COUNT_HEAD[k].test(h)) : -1] as const)
    .filter(([, i]) => i >= 0 && allCounts(i))
  const bare = !header && rows.length > 0 && rows.every(r => r.length >= 4 && isCount(r[1]) && isCount(r[2]) && isCount(r[3]))
  if (named.length > 0 || bare) {
    const cols: [DnvClass, number][] = bare ? [['syn', 1], ['mis', 2], ['lof', 3]] : named.map(([k, i]) => [k, i])
    for (const r of rows) for (const [k, i] of cols) {
      const n = Number(r[i])
      if (Number.isInteger(n) && n > 0) t.record([[r[gi], k]], n)
    }
    const names = cols.map(([k, i]) => header?.[i] ?? `N_${k}`).join(', ')
    return t.result('counts', `${header?.[gi] ?? 'gene'} with ${names}`, rows.length, null, [
      'Counts are taken as given: LoF should cover the same consequences as the model settings, and missense the same score filter.',
    ])
  }

  const ci = find(CSQ_HEAD, gi === 0 ? 1 : 0)
  const si = header ? findScoreField(header, filter) : -1
  const ni = header ? header.findIndex(h => N_HEAD.test(h)) : -1  // optional count per row
  for (const r of rows) {
    const raw = ni >= 0 ? (r[ni] ?? '').trim() : ''
    const n = raw === '' ? 1 : Number(raw)
    if (!Number.isInteger(n) || n < 0) { t.record([[r[gi] ?? '', 'badCount']]); continue }
    if (n === 0) continue
    const cls = scoreCheck(classify(r[ci] ?? '', lof), si >= 0 ? [r[si] ?? ''] : null, filter)
    t.record([[r[gi] ?? '', cls]], n)
  }
  const col = (i: number) => header?.[i] ?? `column ${i + 1}`
  const fields = [gi, ci, si, ni].filter(i => i >= 0).map(col).join(' × ')
  return t.result('list', fields, rows.length, si >= 0 ? col(si) : null)
}

// Reads a table of de novos. A header may start with '#'; other '#' lines are comments.
// VCFs are refused: they hold one record per site, not per de novo.
export function parseDnvs(
  text: string, lof: Consequence[], filter: MissenseFilter,
  resolve: (symbol: string) => string | undefined,
): ParseResult {
  // lines are not trimmed, so an empty first cell keeps the columns in place
  const all = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (all.some(l => /^\s*(##fileformat=VCF|#CHROM)/.test(l))) {
    return { error: 'This looks like a VCF. Give a table instead: one row per de novo (gene and consequence, with an optional count column) or counts per gene.' }
  }
  // the last header-like '#' line before the data is the header; other '#' lines are comments
  let header: string | null = null
  const lines: string[] = []
  for (const l of all) {
    const s = l.trimStart()
    if (s.startsWith('#')) {
      if (lines.length === 0 && isHeaderLine(s.slice(1))) header = s.slice(1).replace(/^[ \t]+/, '')
      continue
    }
    lines.push(l)
  }
  if (header !== null && !(lines.length > 0 && isHeaderLine(lines[0]))) lines.unshift(header)
  return lines.length === 0 ? null : parseTable(lines, lof, filter, resolve)
}

function isHeaderLine(l: string): boolean {
  return l.split(/[\t,\s]+/).some(v => GENE_HEAD.test(v) || CSQ_HEAD.test(v))
}

export interface ClassTest extends PoissonTest { observed: number; expected: number }

function test(o: number, e: number, alt: 'greater' | 'two.sided'): ClassTest | null {
  return e > 0 ? { ...poissonTest(o, e, alt), observed: o, expected: e } : null
}

export interface BurdenReport {
  syn: ClassTest | null      // two-sided: a check of the calibration
  mis: ClassTest | null      // one-sided enrichment
  lof: ClassTest | null
  prot: ClassTest | null     // protein-altering: missense + LoF
  outOfScope: number         // counted variants in genes outside the gene set
}

// P(X >= k) for X ~ Binomial(n, p)
export function pbinomUpper(k: number, n: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  if (p <= 0) return 0
  if (p >= 1) return 1
  const lc = lgamma(n + 1)
  let s = 0
  for (let i = k; i <= n; i++) {
    s += Math.exp(lc - lgamma(i + 1) - lgamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log1p(-p))
  }
  return Math.min(1, s)
}

export type BurdenClass = 'syn' | 'mis' | 'lof' | 'prot'
export const BURDEN_CLASSES: BurdenClass[] = ['syn', 'mis', 'lof', 'prot']

export interface SetComparison {
  inside: BurdenReport
  outside: BurdenReport
  nInside: number
  nOutside: number
  // in-set O/E over outside O/E, and the one-sided p that the set is more enriched: given
  // n = n_in + n_out de novos, n_in ~ Binomial(n, E_in / (E_in + E_out)) if enrichment is equal
  ratio: Record<BurdenClass, number | null>
  p: Record<BurdenClass, number | null>
}

// Burden inside and outside a gene set, within the scope (all genes when null).
export function setBurden(
  parsed: ParsedDnvs, expected: GeneExpected[], scope: Set<string> | null, set: Set<string>,
): SetComparison {
  const base = expected.filter(g => !scope || scope.has(g.gene))
  const inSet = new Set(base.filter(g => set.has(g.gene)).map(g => g.gene))
  const outSet = new Set(base.filter(g => !set.has(g.gene)).map(g => g.gene))
  const inside = burden(parsed, expected, inSet)
  const outside = burden(parsed, expected, outSet)
  const ratio = {} as Record<BurdenClass, number | null>
  const p = {} as Record<BurdenClass, number | null>
  for (const c of BURDEN_CLASSES) {
    const a = inside[c], b = outside[c]
    if (!a || !b) { ratio[c] = null; p[c] = null; continue }
    ratio[c] = b.observed > 0 ? a.ratio / b.ratio : null
    p[c] = pbinomUpper(a.observed, a.observed + b.observed, a.expected / (a.expected + b.expected))
  }
  return { inside, outside, nInside: inSet.size, nOutside: outSet.size, ratio, p }
}

export function burden(parsed: ParsedDnvs, expected: GeneExpected[], scope: Set<string> | null): BurdenReport {
  const obs = zero(), exp = zero()
  let outOfScope = 0
  for (const g of expected) {
    if (scope && !scope.has(g.gene)) continue
    exp.syn += g.syn; exp.mis += g.mis; exp.lof += g.lof
  }
  for (const [gene, c] of parsed.byGene) {
    if (scope && !scope.has(gene)) { outOfScope += c.syn + c.mis + c.lof; continue }
    obs.syn += c.syn; obs.mis += c.mis; obs.lof += c.lof
  }
  return {
    syn: test(obs.syn, exp.syn, 'two.sided'),
    mis: test(obs.mis, exp.mis, 'greater'),
    lof: test(obs.lof, exp.lof, 'greater'),
    prot: test(obs.mis + obs.lof, exp.mis + exp.lof, 'greater'),
    outOfScope,
  }
}

export interface GeneResult {
  gene: string
  chrom: string
  obs: Counts
  exp: { syn: number; mis: number; lof: number; prot: number }
  pLof: number | null   // null: observed with no expected sites (e.g. none pass the score filter)
  pMis: number | null
  pProt: number | null
  pMin: number
  significant: boolean
}

// Genes in scope with at least one missense or LoF de novo, each tested one-sided (exact
// Poisson) for LoF, missense and protein-altering. As in denovolyzeR, LoF and
// protein-altering are the two tests per gene that set the Bonferroni threshold.
export const TESTS_PER_GENE = 2
export function geneTests(
  parsed: ParsedDnvs, expected: GeneExpected[], scope: Set<string> | null, alpha = 0.05,
): { genes: GeneResult[]; nGenes: number; threshold: number } {
  const inScope = scope ? expected.filter(g => scope.has(g.gene)) : expected
  const threshold = alpha / (inScope.length * TESTS_PER_GENE)
  const p = (o: number, e: number) => (e > 0 ? poissonTest(o, e, 'greater').p : o > 0 ? null : 1)
  const genes: GeneResult[] = []
  for (const g of inScope) {
    const c = parsed.byGene.get(g.gene)
    if (!c || c.mis + c.lof === 0) continue
    const pLof = p(c.lof, g.lof), pMis = p(c.mis, g.mis), pProt = p(c.mis + c.lof, g.mis + g.lof)
    const tested = [pLof, pProt].filter((x): x is number => x !== null)
    const pMin = tested.length ? Math.min(...tested) : 1
    genes.push({
      gene: g.gene, chrom: g.chrom, obs: c,
      exp: { syn: g.syn, mis: g.mis, lof: g.lof, prot: g.mis + g.lof },
      pLof, pMis, pProt, pMin, significant: pMin < threshold,
    })
  }
  genes.sort((a, b) => a.pMin - b.pMin || b.obs.lof + b.obs.mis - (a.obs.lof + a.obs.mis))
  return { genes, nGenes: inScope.length, threshold }
}
