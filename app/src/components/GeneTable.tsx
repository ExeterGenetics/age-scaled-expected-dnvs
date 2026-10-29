import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GeneExpected } from '../lib/model'

type SortKey = keyof GeneExpected
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'gene', label: 'Gene' },
  { key: 'chrom', label: 'Chr' },
  { key: 'syn', label: 'Synonymous' },
  { key: 'mis', label: 'Missense' },
  { key: 'lof', label: 'LoF' },
]
const ROW_HEIGHT = 32

export function fmt(x: number): string {
  if (x === 0) return '0'
  if (x >= 100) return x.toFixed(1)
  if (x >= 0.01) return x.toFixed(3)
  return x.toExponential(2)
}

function compare(key: SortKey) {
  if (key === 'chrom') return (a: GeneExpected, b: GeneExpected) => Number(a.chrom) - Number(b.chrom)
  if (key === 'gene') return (a: GeneExpected, b: GeneExpected) => a.gene.localeCompare(b.gene)
  return (a: GeneExpected, b: GeneExpected) => a[key] - b[key]
}

interface GeneTableProps {
  rows: GeneExpected[]
  onDownload: () => void
}

export function GeneTable({ rows, onDownload }: GeneTableProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'lof', dir: -1 })
  const deferredQuery = useDeferredValue(query)

  const visible = useMemo(() => {
    const terms = deferredQuery.trim().toUpperCase().split(/[\s,]+/).filter(Boolean)
    const filtered = terms.length === 0 ? rows
      : terms.length === 1 ? rows.filter(r => r.gene.toUpperCase().startsWith(terms[0]))
      : rows.filter(r => terms.includes(r.gene.toUpperCase()))
    const cmp = compare(sort.key)
    return [...filtered].sort((a, b) => sort.dir * cmp(a, b))
  }, [rows, deferredQuery, sort])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const onSort = (key: SortKey) =>
    setSort(s => s.key === key
      ? { key, dir: s.dir === 1 ? -1 : 1 }
      : { key, dir: key === 'gene' || key === 'chrom' ? 1 : -1 })

  return (
    <>
      <div className="toolbar">
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Filter genes: prefix, or a list like SCN2A, KMT2D" aria-label="Filter genes"
        />
        <button className="btn" type="button" onClick={onDownload} disabled={rows.length === 0}>
          Download TSV
        </button>
      </div>
      <div className="gtable" role="table" aria-rowcount={visible.length + 1}>
        <div className="grow ghead" role="row">
          {COLUMNS.map(c => (
            <button
              key={c.key} type="button" role="columnheader" className="gcell"
              aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
              onClick={() => onSort(c.key)}
            >
              {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
            </button>
          ))}
        </div>
        <div ref={scrollRef} className="gbody" role="rowgroup">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(v => {
              const r = visible[v.index]
              return (
                <div
                  key={r.gene} role="row" className="grow"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
                >
                  <span role="cell" className="gcell">{r.gene}</span>
                  <span role="cell" className="gcell">{r.chrom}</span>
                  <span role="cell" className="gcell">{fmt(r.syn)}</span>
                  <span role="cell" className="gcell">{fmt(r.mis)}</span>
                  <span role="cell" className="gcell">{fmt(r.lof)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="hint right">{visible.length.toLocaleString()} of {rows.length.toLocaleString()} genes</p>
    </>
  )
}
