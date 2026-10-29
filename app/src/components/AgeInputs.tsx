import type { ChangeEvent } from 'react'
import { parseTable, pickAgeColumn } from '../lib/parse'
import type { Table } from '../lib/parse'
import { Field } from './ui'

export interface TsvState {
  table: Table | null
  column: number
  text: string
  fileName: string | null
}

export interface NormalState {
  mean: string
  sd: string
  n: string
}

async function readFileText(file: File): Promise<string> {
  if (/\.gz$/i.test(file.name)) {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).text()
  }
  return file.text()
}

function fromText(text: string, fileName: string | null): TsvState {
  const table = parseTable(text)
  return { table, column: table ? pickAgeColumn(table) : 0, text: fileName ? '' : text, fileName }
}

interface TsvAgeInputProps {
  value: TsvState
  onChange: (value: TsvState) => void
  summary: { ages: number[]; skipped: number } | null
}

export function TsvAgeInput({ value, onChange, summary }: TsvAgeInputProps) {
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onChange(fromText(await readFileText(file), file.name))
  }

  return (
    <>
      <Field label="TSV / CSV file, one row per individual">
        <input type="file" accept=".tsv,.txt,.csv,.gz,text/*" onChange={onFile} />
      </Field>
      <Field label="…or paste ages">
        <textarea
          value={value.text}
          placeholder={'paternal_age\n31\n28\n36'}
          onChange={e => onChange(fromText(e.target.value, null))}
        />
      </Field>
      {value.table && value.table.header.length > 1 && (
        <Field label="Age column">
          <select value={value.column} onChange={e => onChange({ ...value, column: Number(e.target.value) })}>
            {value.table.header.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </Field>
      )}
      <p className="hint">
        {summary && summary.ages.length > 0
          ? `${value.fileName ? value.fileName + ': ' : ''}${summary.ages.length} ages read` +
            (summary.skipped ? `, ${summary.skipped} skipped` : '') +
            `; mean ${(summary.ages.reduce((a, b) => a + b, 0) / summary.ages.length).toFixed(1)}, ` +
            `range ${Math.min(...summary.ages)}–${Math.max(...summary.ages)}.`
          : 'A header row is optional. Blank and non-numeric values are skipped.'}
      </p>
    </>
  )
}

export function NormalAgeInput({ value, onChange }: { value: NormalState; onChange: (v: NormalState) => void }) {
  const set = (key: keyof NormalState) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value })

  return (
    <>
      <div className="row2">
        <Field label="Mean age"><input type="number" step="0.1" value={value.mean} onChange={set('mean')} /></Field>
        <Field label="SD"><input type="number" step="0.1" min="0" value={value.sd} onChange={set('sd')} /></Field>
      </div>
      <Field label="Number of individuals">
        <input type="number" step="1" min="1" value={value.n} onChange={set('n')} />
      </Field>
      <p className="hint">Each bin gets the normal probability mass between its edges; the tails fall into &lt;25 and ≥40.</p>
    </>
  )
}
