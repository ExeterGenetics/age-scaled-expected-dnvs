import { DECODE_AGE_HIST, DECODE_AGE_MIN, DECODE_BIN_MEAN_AGE } from '../data/sources'
import { BINS, rateAtAge } from '../lib/model'
import type { LinearFit, PerBin } from '../lib/model'

const TOTAL_HIST = DECODE_AGE_HIST.reduce((a, b) => a + b, 0)
const MAX_COUNT = Math.max(...DECODE_AGE_HIST)

// Empirical percentile of `age` within the 5,420 Pálsson et al. 2025 deCODE fathers
export function decodePercentile(age: number): number {
  let below = 0
  for (let i = 0; i < DECODE_AGE_HIST.length; i++) {
    const a = DECODE_AGE_MIN + i
    if (a < age) below += DECODE_AGE_HIST[i]
    else if (a === Math.floor(age)) below += DECODE_AGE_HIST[i] * (age - a)
  }
  return Math.max(0, Math.min(100, (100 * below) / TOTAL_HIST))
}

interface Props {
  meanAge: number
  linearFit: LinearFit
  perIndividualRate?: PerBin
  cohortAges?: number[] | null  // optional individual ages from TSV to show cohort spread
  compact?: boolean
}

export function AgeCalibrationChart({ meanAge, linearFit, perIndividualRate, cohortAges, compact = false }: Props) {
  const refRate = rateAtAge(linearFit.meanAge, linearFit)
  const userRate = rateAtAge(meanAge, linearFit)
  const relRate = refRate > 0 ? userRate / refRate : 1
  const pct = decodePercentile(meanAge)

  const xMin = Math.min(16, Math.floor(meanAge - 2))
  const xMax = Math.max(54, Math.ceil(meanAge + 3))
  const W = compact ? 320 : 680
  const H = compact ? 148 : 196
  const L = compact ? 14 : 42
  const R = compact ? 36 : 48
  const T = compact ? 22 : 24
  const B = compact ? 28 : 34
  const plotW = W - L - R
  const plotH = H - T - B

  const sx = (age: number) => L + ((age - xMin) / (xMax - xMin)) * plotW
  const syHist = (count: number) => T + plotH * (1 - (count / MAX_COUNT) * 0.86)

  // Right-axis relative rate scale: spans smoothly across the visible x range
  const relMin = Math.min(0.55, Math.floor((rateAtAge(xMin, linearFit) / refRate) * 10) / 10)
  const relMax = Math.max(1.65, Math.ceil((rateAtAge(xMax, linearFit) / refRate) * 10) / 10)
  const syRel = (r: number) => T + plotH * (1 - (r - relMin) / (relMax - relMin))

  const barW = Math.max(1.5, plotW / (xMax - xMin) - 0.6)
  const ticks: number[] = []
  const step = xMax - xMin > 45 ? 10 : 5
  for (let a = Math.ceil(xMin / step) * step; a <= xMax; a += step) ticks.push(a)

  const relTicks = [0.75, 1.0, 1.25, 1.5, 1.75].filter(r => r >= relMin && r <= relMax)
  const ux = sx(meanAge)
  const uy = syRel(relRate)
  const refX = sx(linearFit.meanAge)
  const labelRight = ux > W - (compact ? 140 : 225)

  // Optional cohort min/max/IQR bar when TSV ages are loaded
  const sortedAges = cohortAges && cohortAges.length > 1 ? [...cohortAges].sort((a, b) => a - b) : null
  const q25 = sortedAges ? sortedAges[Math.floor(sortedAges.length * 0.25)] : null
  const q75 = sortedAges ? sortedAges[Math.floor(sortedAges.length * 0.75)] : null
  const extrap = meanAge < DECODE_BIN_MEAN_AGE.lt_25 || meanAge > DECODE_BIN_MEAN_AGE.gt_39

  return (
    <div className={compact ? 'age-chart-wrap compact' : 'age-chart-wrap'}>
      <svg
        className="age-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Your cohort mean paternal age (${meanAge.toFixed(1)} years, ${relRate.toFixed(2)}× deCODE average) on the deCODE calibration distribution`}
      >
        {/* Horizontal guide at 1.0x reference rate */}
        <line x1={L} x2={W - R} y1={syRel(1.0)} y2={syRel(1.0)} stroke="var(--line)" strokeDasharray="3 3" />

        {/* Exact deCODE paternal-age histogram bars (Pálsson et al. 2025, n = 5,420) */}
        {DECODE_AGE_HIST.map((c, i) => {
          const age = DECODE_AGE_MIN + i
          if (c === 0 || age < xMin || age > xMax) return null
          const y = syHist(c)
          return (
            <rect
              key={age}
              x={sx(age) - barW / 2}
              y={y}
              width={barW}
              height={T + plotH - y}
              fill="var(--bar)"
              fillOpacity={0.42}
              rx={1}
            />
          )
        })}

        {/* Optional cohort IQR bar when individual TSV ages are provided */}
        {q25 !== null && q75 !== null && (
          <line
            x1={sx(Math.max(xMin, q25))} x2={sx(Math.min(xMax, q75))}
            y1={T + plotH - 3} y2={T + plotH - 3}
            stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeOpacity={0.45}
          />
        )}

        {/* deCODE mean paternal age vertical reference */}
        <line x1={refX} x2={refX} y1={T} y2={T + plotH} stroke="var(--muted)" strokeDasharray="2 3" strokeOpacity={0.75} />
        {!compact && (
          <text x={refX + (Math.abs(ux - refX) < 42 && ux >= refX ? -4 : 4)} y={T + 10}
            textAnchor={Math.abs(ux - refX) < 42 && ux >= refX ? 'end' : 'start'} className="ax">
            deCODE mean ({linearFit.meanAge.toFixed(1)} yr)
          </text>
        )}

        {/* Continuous linear scaling line */}
        <line
          x1={sx(xMin)} y1={syRel(rateAtAge(xMin, linearFit) / refRate)}
          x2={sx(xMax)} y2={syRel(rateAtAge(xMax, linearFit) / refRate)}
          stroke="var(--ink)" strokeWidth={1.6} strokeOpacity={0.7}
        />

        {/* The 5 calibrated deCODE bin points */}
        {perIndividualRate && BINS.map(b => {
          const a = DECODE_BIN_MEAN_AGE[b]
          if (a < xMin || a > xMax) return null
          return (
            <circle
              key={b}
              cx={sx(a)} cy={syRel(perIndividualRate[b] / refRate)}
              r={compact ? 2.6 : 3.4}
              fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.3}
            />
          )
        })}

        {/* User's cohort mean paternal age marker */}
        <line x1={ux} x2={ux} y1={T} y2={T + plotH} stroke="var(--accent)" strokeWidth={2} />
        <circle cx={ux} cy={uy} r={compact ? 4.2 : 5.2} fill="var(--accent)" stroke="var(--panel)" strokeWidth={1.8} />
        <text
          x={ux + (labelRight ? -7 : 7)}
          y={Math.max(T + 11, Math.min(T + plotH - 8, uy - 7))}
          textAnchor={labelRight ? 'end' : 'start'}
          className="pt"
        >
          {compact ? `${meanAge.toFixed(1)} yr (${relRate.toFixed(2)}×)` : `Your cohort: ${meanAge.toFixed(1)} yr (${relRate.toFixed(2)}×)`}
        </text>

        {/* X axis */}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} stroke="var(--line)" />
        {ticks.map(a => (
          <g key={a}>
            <line x1={sx(a)} x2={sx(a)} y1={T + plotH} y2={T + plotH + 4} stroke="var(--muted)" />
            <text x={sx(a)} y={T + plotH + 15} textAnchor="middle" className="ax">{a}</text>
          </g>
        ))}
        <text x={L + plotW / 2} y={H - 3} textAnchor="middle" className="ax">
          Paternal age (years)
        </text>

        {/* Left axis label (non-compact) */}
        {!compact && (
          <text x={13} y={T + plotH / 2} transform={`rotate(-90 13 ${T + plotH / 2})`} textAnchor="middle" className="ax">
            deCODE fathers
          </text>
        )}

        {/* Right axis: relative DNM rate multiplier */}
        <line x1={W - R} x2={W - R} y1={T} y2={T + plotH} stroke="var(--line)" />
        {relTicks.map(r => (
          <g key={r}>
            <line x1={W - R} x2={W - R + 3} y1={syRel(r)} y2={syRel(r)} stroke="var(--muted)" />
            <text x={W - R + 6} y={syRel(r) + 3.5} textAnchor="start" className="ax">{r.toFixed(2).replace(/\.00$/, '')}×</text>
          </g>
        ))}
        {!compact && (
          <text x={W - 6} y={T - 8} textAnchor="end" className="ax">Rate vs avg</text>
        )}
      </svg>

      {!compact && (
        <div className="legend age-legend">
          <span><i className="hist" />deCODE calibration fathers (n = 5,420; {Math.round(pct)}th percentile)</span>
          <span><i className="lin" />Linear fit (R² = {linearFit.r2.toFixed(4)})</span>
          <span><i />Your cohort ({meanAge.toFixed(1)} yr · {relRate.toFixed(2)}×)</span>
          {q25 !== null && q75 !== null && (
            <span><i className="iqr" />Your cohort IQR ({q25.toFixed(0)}–{q75.toFixed(0)} yr)</span>
          )}
        </div>
      )}
      {extrap && (
        <p className="hint warn">
          Mean paternal age ({meanAge.toFixed(1)} yr) lies outside the deCODE bin-mean range (22.1–44.4 yr); expected counts use linear extrapolation.
        </p>
      )}
    </div>
  )
}
