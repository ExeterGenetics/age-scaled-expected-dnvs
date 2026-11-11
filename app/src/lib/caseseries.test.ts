import { describe, expect, it } from 'vitest'
import { chanceSubmissions, individualsNeeded, median, percentileBelow } from './caseseries'
import { ppoisUpper } from './poisson'

describe('individualsNeeded', () => {
  // R: qgamma(c(0.5, 0.95), 16) = 15.66793, 23.09713; qgamma(0.5, 1) = log(2)
  it('matches R qgamma divided by the rate', () => {
    expect(individualsNeeded(16, 1e-5, 0.5)).toBeCloseTo(15.66793 / 1e-5, -1)
    expect(individualsNeeded(16, 1e-5, 0.95) / (23.09713 / 1e-5)).toBeCloseTo(1, 6)
    expect(individualsNeeded(1, 1, 0.5)).toBeCloseTo(Math.LN2, 8)
  })
  it('gives probability q of reaching k at that cohort size', () => {
    const mu = 4.5e-5, n = individualsNeeded(16, mu, 0.5)
    expect(ppoisUpper(16, n * mu)).toBeCloseTo(0.5, 8)
  })
})

describe('chanceSubmissions', () => {
  it('scales submissions by the share of the exome rate', () => {
    expect(chanceSubmissions(1, 1000, 118780)).toBeCloseTo(118.78, 8)
  })
})

describe('median and percentileBelow', () => {
  it('handle odd, even and ties', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(percentileBelow([1, 2, 2, 3], 2)).toBe(0.25)
    expect(percentileBelow([1, 2, 3], 10)).toBe(1)
  })
})
