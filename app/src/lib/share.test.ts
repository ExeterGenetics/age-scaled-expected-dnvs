import { describe, expect, it } from 'vitest'
import { caseLinkQuery, decodeCaseLink, encodeCaseLink } from './share'
import type { CaseLink } from './share'

const link: CaseLink = {
  genesText: 'ARID1B, SCN2A', cons: 'both', k: '10', log10N: 5, matches: '3',
  ages: { mode: 'normal', mean: '35', sd: '6' }, missense: { score: 'revel', threshold: 0.644 },
  lof: ['stop_gained', 'splice_donor'], sites: 'all', background: 'k_synonymous',
}

describe('case series links', () => {
  it('round-trips every input', () => {
    const q = encodeCaseLink(link)
    expect(caseLinkQuery(`#case-series?${q}`)).toBe(q)
    expect(decodeCaseLink(q)).toEqual({ ...link, log10N: 5 })
  })
  it('drops malformed values', () => {
    const d = decodeCaseLink('t=xyz&k=abc&f=revel:0.5&lof=stop_gained,bogus&bg=nope&age=33')
    expect(d.cons).toBeUndefined()
    expect(d.k).toBeUndefined()
    expect(d.missense).toBeUndefined()  // 0.5 is not a published cutoff
    expect(d.lof).toEqual(['stop_gained'])
    expect(d.background).toBeUndefined()
    expect(d.ages).toBeUndefined()
  })
})
