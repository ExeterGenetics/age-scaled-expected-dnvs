// Gene-set subsetting: pre-built sets from build_gene_sets.py and custom pasted lists.

export interface GeneSet {
  id: string
  label: string
  description: string
  source: string
  n_source: number
  n_in_rates: number
  // source genes with no rates, by reason: not_autosomal, not_protein_coding,
  // no_rates (autosomal protein-coding but absent from the roulette VCFs), unknown_symbol
  unmatched: Record<string, string[]>
  genes: string[]
}

export interface GeneSetsFile {
  built: string
  sets: GeneSet[]
  aliases: Record<string, string>  // upper-case previous/alias symbol -> gene_rates symbol
  non_autosomal?: Record<string, string>  // upper-case symbol of a protein-coding gene off the autosomes -> X, Y, X/Y or MT
}

// Unmatched symbols split into genes off the autosomes (not modelled: the rates are
// autosomal) and symbols not recognised at all.
export function splitUnmatched(
  symbols: string[], nonAutosomal: Record<string, string>,
): { offAutosome: [string, string][]; unknown: string[] } {
  const offAutosome: [string, string][] = []
  const unknown: string[] = []
  for (const s of symbols) {
    const c = nonAutosomal[s.toUpperCase()]
    if (c) offAutosome.push([s, c]); else unknown.push(s)
  }
  return { offAutosome, unknown }
}

// "DDX3X (X), SRY (Y)" style list, shortened after max entries
export function describeOffAutosome(genes: [string, string][], max = 8): string {
  const shown = genes.slice(0, max).map(([g, c]) => `${g} (${c})`).join(', ')
  return genes.length > max ? `${shown} +${genes.length - max} more` : shown
}

export interface ResolvedList {
  genes: string[]
  renamed: [string, string][]  // [as given, gene_rates symbol]
  unmatched: string[]
  duplicates: number
}

// Symbols separated by whitespace, commas or semicolons; a header such as "gene" or
// "symbol" is dropped. Only the first column of a tab-separated file is read.
export function parseGeneList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.split('\t')[0])
    .flatMap(field => field.split(/[\s,;]+/))
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(s => s !== '' && !/^(gene|genes|symbol|gene_symbol|hgnc_symbol)$/i.test(s))
}

export function resolveGeneList(
  symbols: string[], rateGenes: Map<string, string>, aliases: Record<string, string>,
): ResolvedList {
  const genes = new Set<string>()
  const renamed: [string, string][] = []
  const unmatched: string[] = []
  let duplicates = 0
  for (const s of symbols) {
    const up = s.toUpperCase()
    const direct = rateGenes.get(up)
    const viaAlias = direct ? undefined : aliases[up]
    const g = direct ?? viaAlias
    if (!g) { unmatched.push(s); continue }
    if (genes.has(g)) { duplicates++; continue }
    genes.add(g)
    if (viaAlias) renamed.push([s, g])
  }
  return { genes: [...genes], renamed, unmatched: [...new Set(unmatched)], duplicates }
}
