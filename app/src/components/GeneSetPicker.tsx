import type { ChangeEvent } from 'react'
import type { GeneSet, ResolvedList } from '../lib/genesets'
import { Field } from './ui'

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

export function GeneSetPicker({ sets, value, onChange, customText, onCustomText, custom, nGenes }: GeneSetPickerProps) {
  const selected = sets.find(s => s.id === value)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onCustomText(await file.text())
  }

  return (
    <>
      <Field label="Subset genes to">
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value={ALL_GENES}>All genes ({nGenes.toLocaleString()})</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.label} ({s.n_in_rates.toLocaleString()})</option>)}
          <option value={CUSTOM}>Custom gene list…</option>
        </select>
      </Field>

      {selected && (
        <div className="hint">
          {selected.description}. Source: {selected.source}. {selected.n_in_rates.toLocaleString()} of{' '}
          {selected.n_source.toLocaleString()} source genes have rates
          {selected.n_in_rates < selected.n_source ? '; without rates:' : '.'}
          <Missing unmatched={selected.unmatched} />
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
            <input type="file" accept=".txt,.tsv,.csv,text/*" onChange={onFile} />
          </Field>
          {custom && (custom.genes.length > 0 || custom.unmatched.length > 0) && (
            <p className="hint">
              {custom.genes.length.toLocaleString()} genes matched
              {custom.renamed.length > 0 && <> ({custom.renamed.length} via previous/alias symbols:{' '}
                <Preview items={custom.renamed.map(([a, b]) => `${a}→${b}`)} max={6} />)</>}
              {custom.duplicates > 0 && <>, {custom.duplicates} duplicates ignored</>}.
              {custom.unmatched.length > 0 && (
                <span className="warn"> {custom.unmatched.length} not found: <Preview items={custom.unmatched} />.</span>
              )}
            </p>
          )}
        </>
      )}
    </>
  )
}
