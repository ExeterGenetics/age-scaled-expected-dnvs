// Export of a result: a PDF report built in the browser, or TSV / CSV of every input and output.

import { useState } from 'react'
import type { RefObject } from 'react'
import { downloadText, toDelimited } from '../lib/report'
import type { ReportRow } from '../lib/report'
import type { LegendItem } from '../lib/pdf'
import { Panel } from './ui'

interface Props {
  rows: ReportRow[]
  fileStem: string                            // download name without extension or date
  title: string
  titleGene?: string                          // gene symbol ending the title, italic in the PDF
  chartRef?: RefObject<HTMLElement | null>    // element holding the on-screen chart SVG
  chartAfter?: string                         // report section after which the chart goes
  legend?: LegendItem[]
  notes: string[]                             // interpretation notes at the end of the PDF
}

export function ReportExport({ rows, fileStem, title, titleGene, chartRef, chartAfter, legend, notes }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the generation time and file date are taken when the user exports, not when the page drew
  const stamp = () => {
    const now = new Date().toISOString()
    return {
      rows: [...rows, { section: 'Tool', field: 'Generated', value: now.replace('T', ' ').slice(0, 16) + ' UTC' }],
      stem: `${fileStem}_${now.slice(0, 10)}`,
    }
  }
  const download = (format: 'tsv' | 'csv') => {
    const s = stamp()
    downloadText(toDelimited(s.rows, format), `${s.stem}.${format}`, format === 'csv' ? 'text/csv' : 'text/tab-separated-values')
  }
  const pdf = async () => {
    setBusy(true); setError(null)
    try {
      const { saveReportPdf } = await import('../lib/pdf')
      const s = stamp()
      await saveReportPdf({ rows: s.rows, title, titleGene, fileStem: s.stem, chartAfter, legend, notes, chart: chartRef?.current?.querySelector('svg') ?? null })
    } catch (e) {
      setError(`Could not make the PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Report">
      <div className="export-row">
        <button type="button" className="btn" onClick={pdf} disabled={busy}>{busy ? 'Making PDF…' : 'PDF report'}</button>
        <button type="button" className="btn secondary" onClick={() => download('tsv')}>TSV</button>
        <button type="button" className="btn secondary" onClick={() => download('csv')}>CSV</button>
      </div>
      <p className="hint">All inputs and results, with the tool version and date.</p>
      {error && <p className="err" role="alert">{error}</p>}
    </Panel>
  )
}
