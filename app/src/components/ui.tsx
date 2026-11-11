import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { readFileText } from '../lib/gzip'

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

// Gene symbols are always italic: a comma-separated list, shortened after max
export function Genes({ list, max = Infinity }: { list: string[]; max?: number }) {
  const shown = list.slice(0, max)
  return (
    <>
      {shown.map((g, i) => <span key={g}>{i > 0 && ', '}<i>{g}</i></span>)}
      {list.length > max && ` +${list.length - max} more`}
    </>
  )
}

// previous symbol → current symbol pairs
export function Renames({ pairs, max = Infinity }: { pairs: [string, string][]; max?: number }) {
  return (
    <>
      {pairs.slice(0, max).map(([a, b], i) => <span key={a}>{i > 0 && ', '}<i>{a}</i>→<i>{b}</i></span>)}
      {pairs.length > max && ', …'}
    </>
  )
}

// genes off the autosomes with their chromosome, e.g. DDX3X (X)
export function OffAutosome({ genes, max = 8 }: { genes: [string, string][]; max?: number }) {
  return (
    <>
      {genes.slice(0, max).map(([g, c], i) => <span key={g}>{i > 0 && ', '}<i>{g}</i> ({c})</span>)}
      {genes.length > max && ` +${genes.length - max} more`}
    </>
  )
}

// File input handler shared by the upload boxes: reads plain or gzipped text, reports a
// failed read instead of failing silently, and resets the input so the same file can be
// chosen again.
export function useFileInput(onLoad: (text: string, fileName: string) => void) {
  const [error, setError] = useState<string | null>(null)
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setError(null)
    try {
      onLoad(await readFileText(file), file.name)
    } catch {
      // browsers report gzip failures vaguely ("Failed to fetch"), so say what usually causes them
      setError(`Could not read ${file.name}: it may be damaged or not really gzip. Try the uncompressed file.`)
    }
  }
  return { onFile, error }
}
