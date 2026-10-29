// Exact Poisson test of an observed count against an expected count, matching R's
// poisson.test(x, T = expected): p-value for each alternative and the exact
// (Garwood) 95% CI on observed / expected.

export type Alternative = 'greater' | 'two.sided' | 'less'

// Lanczos approximation (g = 7, n = 9), ~15 significant digits for x > 0
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  x -= 1
  let a = LANCZOS[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

// Regularized incomplete gamma P(a, x) and Q(a, x) = 1 - P, each computed directly so
// small tails keep their precision (series for x < a + 1, continued fraction otherwise).
function incGamma(a: number, x: number): { p: number; q: number } {
  if (x <= 0) return { p: 0, q: 1 }
  const lead = Math.exp(a * Math.log(x) - x - lgamma(a))
  if (x < a + 1) {
    let term = 1 / a, sum = term
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break
    }
    const p = Math.min(1, sum * lead)
    return { p, q: 1 - p }
  }
  const tiny = 1e-300
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  const q = Math.min(1, lead * h)
  return { p: 1 - q, q }
}

export function dpois(k: number, m: number): number {
  return Math.exp(k * Math.log(m) - m - lgamma(k + 1))
}
// P(X <= k)
export function ppois(k: number, m: number): number {
  return k < 0 ? 0 : incGamma(k + 1, m).q
}
// P(X >= k)
export function ppoisUpper(k: number, m: number): number {
  return k <= 0 ? 1 : incGamma(k, m).p
}

// x such that P(a, x) = p, by bisection
function qgamma(p: number, a: number): number {
  let lo = 0, hi = Math.max(1, a)
  while (incGamma(a, hi).p < p) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (incGamma(a, mid).p < p) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

function twoSided(x: number, m: number): number {
  const relErr = 1 + 1e-7
  const d = dpois(x, m)
  if (x === m) return 1
  if (x < m) {
    let n = Math.ceil(2 * m - x)
    while (dpois(n, m) > d) n *= 2
    let y = 0
    for (let i = Math.ceil(m); i <= n; i++) if (dpois(i, m) <= d * relErr) y++
    return Math.min(1, ppois(x, m) + ppoisUpper(n - y + 1, m))
  }
  let y = 0
  for (let i = 0; i <= Math.floor(m); i++) if (dpois(i, m) <= d * relErr) y++
  return Math.min(1, ppois(y - 1, m) + ppoisUpper(x, m))
}

export interface PoissonTest {
  ratio: number
  ci: [number, number]
  p: number
}

export function poissonTest(observed: number, expected: number, alternative: Alternative): PoissonTest {
  const p = alternative === 'greater' ? ppoisUpper(observed, expected)
    : alternative === 'less' ? ppois(observed, expected)
    : twoSided(observed, expected)
  const lower = observed === 0 ? 0 : qgamma(0.025, observed) / expected
  const upper = qgamma(0.975, observed + 1) / expected
  return { ratio: observed / expected, ci: [lower, upper], p }
}
