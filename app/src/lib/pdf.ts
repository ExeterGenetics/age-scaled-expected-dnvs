// PDF report built in the browser with jsPDF (text, tables via jspdf-autotable, the chart as
// vectors via svg2pdf.js). The libraries and font load only when a report is requested.

import { BUILD, CONTACTS, PROJECT_URL, TOOL_NAME, TOOL_URL } from './report'
import type { ReportRow } from './report'

// italicLead: a gene symbol drawn in italics before the label
export interface LegendItem { label: string; italicLead?: string; dash: 'solid' | 'dashed' | 'dotted'; color: [number, number, number] }

export interface PdfReport {
  rows: ReportRow[]
  title: string
  titleGene?: string             // gene symbol ending the title, set in italics
  fileStem: string
  chart?: SVGSVGElement | null   // the on-screen chart, copied with its computed styles
  chartAfter?: string            // section after which the chart goes
  legend?: LegendItem[]
  notes: string[]
}

const ACCENT: [number, number, number] = [47, 93, 138]
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'] as const

// copy of the SVG with computed styles written as attributes (svg2pdf reads attributes, not page
// CSS or custom properties), in the embedded font
function inlineSvg(svg: SVGSVGElement): SVGSVGElement {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [copy, ...copy.querySelectorAll('*')]
  src.forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v && v !== 'normal' && v !== 'auto') dst[i].setAttribute(p, v)
    }
    if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
      // only the embedded regular and bold faces exist, so map numeric weights onto them
      dst[i].setAttribute('font-family', 'DejaVu')
      dst[i].setAttribute('font-weight', Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold' ? 'bold' : 'normal')
    }
    dst[i].removeAttribute('class')
  })
  return copy
}

export async function saveReportPdf(r: PdfReport) {
  const [{ jsPDF }, { autoTable }, { svg2pdf }, fonts] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('svg2pdf.js'), import('./pdfFont'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', fonts.DEJAVU_SANS)
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.DEJAVU_SANS_BOLD)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold')
  doc.addFileToVFS('DejaVuSans-Oblique.ttf', fonts.DEJAVU_SANS_ITALIC)
  doc.addFont('DejaVuSans-Oblique.ttf', 'DejaVu', 'italic')
  doc.addFileToVFS('DejaVuSans-BoldOblique.ttf', fonts.DEJAVU_SANS_BOLD_ITALIC)
  doc.addFont('DejaVuSans-BoldOblique.ttf', 'DejaVu', 'bolditalic')
  doc.setFont('DejaVu', 'normal')
  doc.setProperties({ title: r.title, subject: TOOL_NAME, creator: `${TOOL_NAME} ${BUILD.date} (${BUILD.commit})` })

  const M = 15, W = 210 - 2 * M, BOTTOM = 297 - 22
  let y = M + 2
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M + 2 } }

  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16); doc.setTextColor(0)
  if (r.titleGene && r.title.endsWith(r.titleGene)) {
    const lead = r.title.slice(0, -r.titleGene.length)
    doc.text(lead, M, y + 4)
    const x = M + doc.getTextWidth(lead)
    doc.setFont('DejaVu', 'bolditalic'); doc.text(r.titleGene, x, y + 4)
  } else {
    doc.text(r.title, M, y + 4)
  }
  y += 9
  const generated = r.rows.find(x => x.section === 'Tool' && x.field === 'Generated')?.value ?? ''
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(90)
  const sub = doc.splitTextToSize(`${TOOL_NAME} · ${TOOL_URL} · build ${BUILD.date} (${BUILD.commit}) · generated ${generated}`, W) as string[]
  doc.text(sub, M, y); y += sub.length * 3.4 + 3

  const heading = (text: string) => {
    ensure(14)
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
    doc.text(text, M, y + 4)
    doc.setDrawColor(...ACCENT); doc.setLineWidth(0.5); doc.line(M, y + 5.6, M + W, y + 5.6)
    y += 8
  }

  const sections = [...new Set(r.rows.map(x => x.section))].filter(s => s !== 'Tool')
  for (const s of sections) {
    heading(s)
    const sectionRows = r.rows.filter(x => x.section === s)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      theme: 'plain',
      body: sectionRows.map(x => [x.field, x.value]),
      didParseCell: d => {
        const it = sectionRows[d.row.index]?.italic
        if (d.section === 'body' && it === 'value' && d.column.index === 1) d.cell.styles.fontStyle = 'italic'
        if (d.section === 'body' && it === 'field' && d.column.index === 0) d.cell.styles.fontStyle = 'bolditalic'
      },
      styles: { font: 'DejaVu', fontSize: 9, cellPadding: { top: 1.3, bottom: 1.3, left: 0, right: 3 }, textColor: 20,
        lineColor: 210, lineWidth: { bottom: 0.15 } },
      columnStyles: { 0: { cellWidth: 72, fontStyle: 'bold', textColor: 60 } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

    if (s === r.chartAfter && r.chart) {
      const vb = r.chart.viewBox.baseVal
      const h = W * (vb.height / vb.width)
      ensure(h + 16)  // chart plus a legend of up to two lines
      await svg2pdf(inlineSvg(r.chart), doc, { x: M, y, width: W, height: h })
      y += h + 2
      if (r.legend) {
        doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(60)
        let x = M
        for (const item of r.legend) {
          // wrap to a new line when the item would pass the right margin
          doc.setFont('DejaVu', 'italic')
          const leadW = item.italicLead ? doc.getTextWidth(item.italicLead) : 0
          doc.setFont('DejaVu', 'normal')
          const itemW = 7.5 + leadW + doc.getTextWidth(item.label)
          if (x > M && x + itemW > M + W) { x = M; y += 5 }
          doc.setDrawColor(...item.color); doc.setLineWidth(0.6)
          doc.setLineDashPattern(item.dash === 'dashed' ? [1.6, 1] : item.dash === 'dotted' ? [0.3, 0.8] : [], 0)
          doc.line(x, y + 1.5, x + 6, y + 1.5)
          doc.setLineDashPattern([], 0)
          let tx = x + 7.5
          if (item.italicLead) {
            doc.setFont('DejaVu', 'italic'); doc.text(item.italicLead, tx, y + 2.4)
            tx += doc.getTextWidth(item.italicLead); doc.setFont('DejaVu', 'normal')
          }
          doc.text(item.label, tx, y + 2.4)
          x = tx + doc.getTextWidth(item.label) + 6
        }
        y += 7
      }
    }
  }

  if (r.notes.length) {
    heading('Notes')
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setTextColor(20)
    for (const n of r.notes) {
      const lines = doc.splitTextToSize(n, W - 5) as string[]
      ensure(lines.length * 4.2 + 1)
      doc.text('•', M, y + 3)
      doc.text(lines, M + 4, y + 3)
      y += lines.length * 4.2 + 1
    }
  }

  // footer and page numbers on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110)
    doc.text(`Contact: ${CONTACTS.map(c => `${c.name}, ${c.email}`).join('; ')} · ${PROJECT_URL}`, M, 297 - 14)
    doc.text('Rates: Roulette (Seplyarskiy et al. 2023), calibrated to deCODE trios (Pálsson et al. 2025)', M, 297 - 10.5)
    doc.text(`${i} / ${pages}`, 210 - M, 297 - 10.5, { align: 'right' })
  }
  doc.save(`${r.fileStem}.pdf`)
}
