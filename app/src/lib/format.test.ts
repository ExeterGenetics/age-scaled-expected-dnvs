import { describe, expect, it } from 'vitest'
import { count, sci } from './format'

describe('display formatting', () => {
  it('writes scientific notation with superscripts', () => {
    expect(sci(8.2871e-8, 4)).toBe('8.287 × 10⁻⁸')
    expect(sci(9.9996e-5, 3)).toBe('1.00 × 10⁻⁴')
    expect(sci(0)).toBe('0')
  })
  it('separates thousands and keeps small counts readable', () => {
    expect(count(8656.4)).toBe('8,656')
    expect(count(2.34)).toBe('2.3')
    expect(count(0.0075)).toBe('7.5 × 10⁻³')
  })
})
