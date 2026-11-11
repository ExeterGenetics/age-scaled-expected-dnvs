// Display formatting shared by the tabs: scientific notation as "8.29 × 10⁻⁸" everywhere on
// screen (downloads keep e-notation).

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'

export function sci(x: number, digits = 3): string {
  if (x === 0) return '0'
  if (!Number.isFinite(x)) return '–'
  let e = Math.floor(Math.log10(Math.abs(x)))
  let m = +(x / 10 ** e).toPrecision(digits)
  if (Math.abs(m) >= 10) { m /= 10; e += 1 }  // 9.996 rounding up to 10.0
  const sup = String(e).replace('-', '⁻').replace(/\d/g, d => SUP[+d])
  return `${m.toFixed(digits - 1)} × 10${sup}`
}

// counts and expectations: separators for large values, scientific for tiny ones
export function count(x: number): string {
  if (x >= 100) return Math.round(x).toLocaleString()
  if (x >= 1) return x.toFixed(1)
  if (x >= 0.01) return x.toFixed(3)
  return sci(x, 2)
}

// p-values: two decimals, then scientific; never 1 or 0
export function fmtP(p: number): string {
  if (p >= 0.995) return '> 0.99'
  if (p >= 0.01) return p.toFixed(2)
  if (p >= 0.001) return p.toFixed(3)
  if (p < 1e-300) return '< 10⁻³⁰⁰'
  return sci(p, 2)
}

// ratios such as O/E: three significant figures
export function fmtR(r: number): string {
  return r >= 100 ? r.toFixed(0) : r.toPrecision(3)
}
