import { BACKGROUNDS, BINS, CONSEQUENCES, emptyPerBin } from './model'
import type { Background, Bin, Consequence, GeneRates, PerBin } from './model'

export interface Table {
  header: string[]
  rows: string[][]
}

// Tab, comma or whitespace separated; a header row is detected when the first row
// holds any non-numeric value.
export function parseTable(text: string): Table | null {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return null
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : /\s+/
  const rows = lines.map(l => l.trim().split(sep).map(v => v.trim()))
  const hasHeader = rows[0].some(v => v !== '' && !Number.isFinite(Number(v)))
  const header = hasHeader ? rows.shift()! : rows[0].map((_, i) => `column ${i + 1}`)
  return { header, rows }
}

export function pickAgeColumn(t: Table): number {
  const named = t.header.findIndex(h => /pat|father|dad/i.test(h))
  if (named >= 0) return named
  const numeric = t.header.findIndex((_, i) => t.rows.some(r => Number.isFinite(parseFloat(r[i]))))
  return Math.max(numeric, 0)
}

export function readAges(t: Table, column: number): { ages: number[]; skipped: number } {
  const ages: number[] = []
  let skipped = 0
  for (const r of t.rows) {
    const v = parseFloat(r[column])
    if (Number.isFinite(v) && v > 0) ages.push(v)
    else skipped++
  }
  return { ages, skipped }
}

// gene_rates.tsv from build_gene_rates.py: gene, chrom, hq_<consequence>..., all_<consequence>...
export function parseGeneRates(text: string): GeneRates[] {
  const [head, ...lines] = text.trim().split('\n')
  const cols = head.split('\t')
  const idx = (name: string) => {
    const i = cols.indexOf(name)
    if (i < 0) throw new Error(`gene_rates.tsv is missing column ${name}`)
    return i
  }
  const hqIdx = CONSEQUENCES.map(c => idx('hq_' + c))
  const allIdx = CONSEQUENCES.map(c => idx('all_' + c))
  const pick = (f: string[], ix: number[]) =>
    Object.fromEntries(CONSEQUENCES.map((c, j) => [c, Number(f[ix[j]])])) as Record<Consequence, number>
  return lines.map(line => {
    const f = line.split('\t')
    return { gene: f[0], chrom: f[1], hq: pick(f, hqIdx), all: pick(f, allIdx) }
  })
}

// scaling_factors_pat_only.tsv: input_file (…dnm_input_file_pat_<bin>.tsv), k_all_coding, k_synonymous, k_intergenic
export function parseScalingFactors(text: string): Record<Background, PerBin> {
  const t = parseTable(text)
  if (!t) throw new Error('scaling factors file is empty')
  const fileCol = t.header.indexOf('input_file')
  const out = Object.fromEntries(
    (Object.keys(BACKGROUNDS) as Background[]).map(b => [b, emptyPerBin()]),
  ) as Record<Background, PerBin>
  const seen = new Set<Bin>()
  for (const r of t.rows) {
    const bin = r[fileCol].match(/pat_(\w+?)\.tsv$/)?.[1] as Bin | undefined
    if (!bin || !BINS.includes(bin)) throw new Error(`unrecognised age bin in ${r[fileCol]}`)
    seen.add(bin)
    for (const bg of Object.keys(BACKGROUNDS) as Background[]) {
      out[bg][bin] = Number(r[t.header.indexOf(bg)])
    }
  }
  const missing = BINS.filter(b => !seen.has(b))
  if (missing.length) throw new Error(`scaling factors missing bins: ${missing.join(', ')}`)
  return out
}
