import { describe, expect, it } from 'vitest'
import { poissonTest } from './poisson'

// R: poisson.test(x, T) -> [x, T, p greater, p less, p two-sided, CI lower, CI upper]
const R = [
  [10, 5, 0.03182805731, 0.9863047314, 0.03856600431, 0.9590777392, 3.678071208],
  [3, 8.2, 0.9882393341, 0.03699986413, 0.07748129838, 0.07544781987, 1.069179643],
  [0, 2.48, 1, 0.08374322559, 0.1899092507, 0, 1.487451393],
  [700, 647.6, 0.02171503164, 0.9801970228, 0.04098402476, 1.002312817, 1.164041634],
  [40, 33.04, 0.1317535895, 0.8999323651, 0.2224104154, 0.8649087906, 1.648566797],
  [1, 0.001, 0.0009995001666, 0.9999995003, 0.0009995001666, 25.31780798, 5571.643391],
  [5, 5, 0.5595067149, 0.6159606548, 1, 0.324697278, 2.333666416],
]

describe('poissonTest matches R poisson.test', () => {
  it.each(R)('x = %d, T = %d', (x, m, greater, less, two, lo, hi) => {
    expect(poissonTest(x, m, 'greater').p).toBeCloseTo(greater, 8)
    expect(poissonTest(x, m, 'less').p).toBeCloseTo(less, 8)
    const t = poissonTest(x, m, 'two.sided')
    expect(t.p).toBeCloseTo(two, 8)
    expect(t.ci[0]).toBeCloseTo(lo, 6)
    expect(t.ci[1] / hi).toBeCloseTo(1, 6)
  })
})
