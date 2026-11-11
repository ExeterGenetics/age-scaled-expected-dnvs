// Exportable reports: rows of section, field and value, written as TSV or CSV.

// italic: gene symbols in the field or value, set in italics in the PDF
export interface ReportRow { section: string; field: string; value: string; italic?: 'field' | 'value' }

export const TOOL_NAME = 'Age-scaled expected de novo SNVs'
export const TOOL_URL = 'https://exetergenetics.github.io/age-scaled-expected-dnvs/'
export const PROJECT_URL = 'https://paradigmgenomics.org/'
export const CONTACTS = [
  { name: 'V. Kartik Chundru', email: 'v.chundru AT exeter.ac.uk' },
  { name: 'Caroline Wright', email: 'caroline.wright AT exeter.ac.uk' },
]
export const BUILD = {
  date: __BUILD_DATE__,
  commit: ((import.meta.env.VITE_COMMIT as string | undefined) ?? 'local').slice(0, 7),
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toDelimited(rows: ReportRow[], format: 'tsv' | 'csv'): string {
  const lines = [['section', 'field', 'value'], ...rows.map(r => [r.section, r.field, r.value])]
  return lines.map(l => (format === 'csv'
    ? l.map(csvCell).join(',')
    : l.map(v => v.replace(/[\t\r\n]+/g, ' ')).join('\t'))).join('\n') + '\n'
}

export function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// a number to 4 significant figures, in e-notation when small, for exported values
export function num(x: number): string {
  if (!Number.isFinite(x)) return 'NA'
  if (x !== 0 && Math.abs(x) < 1e-3) return x.toExponential(3)
  return String(+x.toPrecision(4))
}
