import type { GeneSet, ResolvedList } from '../lib/genesets'
import { splitUnmatched } from '../lib/genesets'
import { NON_AUTOSOMAL } from '../data/sources'
import { Field, OffAutosome, useFileInput } from './ui'

export const ALL_GENES = 'all'
export const CUSTOM = 'custom'

interface GeneSetPickerProps {
  sets: GeneSet[]
  value: string
  onChange: (id: string) => void
  customText: string
  onCustomText: (text: string) => void
  custom: ResolvedList | null
  nGenes: number
  label?: string
  noneLabel?: string  // text for the no-subset option
}

function Preview({ items, max = 12 }: { items: string[]; max?: number }) {
  return <><i>{items.slice(0, max).join(', ')}</i>{items.length > max ? `, … (+${items.length - max})` : ''}</>
}

const MISSING_REASONS: Record<string, string> = {
  not_autosomal: 'not autosomal',
  not_protein_coding: 'not protein-coding',
  no_rates: 'autosomal protein-coding but absent from the roulette VCFs',
  unknown_symbol: 'not in HGNC',
}

function Missing({ unmatched }: { unmatched: Record<string, string[]> }) {
  const reasons = Object.keys(unmatched)
  if (reasons.length === 0) return null
  return (
    <ul className="missing">
      {reasons.map(r => (
        <li key={r} className={r === 'no_rates' ? 'warn' : undefined}>
          {unmatched[r].length} {MISSING_REASONS[r] ?? r}
          {r !== 'not_autosomal' && <>: <Preview items={unmatched[r]} max={8} /></>}
        </li>
      ))}
    </ul>
  )
}

export function GeneSetPicker({
  sets, value, onChange, customText, onCustomText, custom, nGenes, label = 'Subset genes to', noneLabel,
}: GeneSetPickerProps) {
  const selected = sets.find(s => s.id === value)
  const { offAutosome: offAuto, unknown } = splitUnmatched(custom?.unmatched ?? [], NON_AUTOSOMAL)

  const { onFile, error: fileError } = useFileInput(text => onCustomText(text))

  return (
    <>
      <Field label={label}>
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value={ALL_GENES}>{noneLabel ?? `All genes (${nGenes.toLocaleString()})`}</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.label} ({s.n_in_rates.toLocaleString()})</option>)}
          <option value={CUSTOM}>Custom gene list…</option>
        </select>
      </Field>

      {selected && (
        <div className="hint">
          {selected.description} ({selected.source}).
          {selected.n_in_rates < selected.n_source && (
            <details className="missing-genes">
              <summary>{(selected.n_source - selected.n_in_rates).toLocaleString()} of {selected.n_source.toLocaleString()} genes without rates</summary>
              <Missing unmatched={selected.unmatched} />
            </details>
          )}
        </div>
      )}

      {value === CUSTOM && (
        <>
          <Field label="Gene symbols, one per line or comma-separated">
            <textarea
              value={customText} onChange={e => onCustomText(e.target.value)}
              placeholder={'SCN2A\nKMT2D\nARID1B'} aria-label="Custom gene list"
            />
          </Field>
          <Field label="…or load a file (first column)">
            <input type="file" accept=".txt,.tsv,.csv,.gz,text/*" onChange={onFile} />
          </Field>
          {fileError && <p className="err" role="alert">{fileError}</p>}
          {custom && (custom.genes.length > 0 || custom.unmatched.length > 0) && (
            <p className="hint">
              {custom.genes.length.toLocaleString()} genes matched
              {custom.renamed.length > 0 && <> ({custom.renamed.length} via previous/alias symbols:{' '}
                <Preview items={custom.renamed.map(([a, b]) => `${a}→${b}`)} max={6} />)</>}
              {custom.duplicates > 0 && <>, {custom.duplicates} duplicates ignored</>}.
              {offAuto.length > 0 && (
                <span className="warn"> {offAuto.length} not modelled (rates are autosomal only): <OffAutosome genes={offAuto} />.</span>
              )}
              {unknown.length > 0 && (
                <span className="warn"> {unknown.length} not found: <Preview items={unknown} />.</span>
              )}
            </p>
          )}
        </>
      )}
    </>
  )
}
