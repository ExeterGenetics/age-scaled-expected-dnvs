import { describe, expect, it } from 'vitest'
import { caseLinkQuery, decodeCaseLink, encodeCaseLink } from './share'
import type { CaseLink } from './share'

const link: CaseLink = {
  genesText: 'ARID1B, SCN2A', cons: 'both', k: '10', log10N: 5, matches: '3',
  ages: { mode: 'mean', mean: '35' }, missense: { score: 'revel', threshold: 0.644 },
  lof: ['stop_gained', 'splice_donor'], sites: 'all', background: 'k_synonymous',
}

describe('case series links', () => {
  it('round-trips every input', () => {
    const q = encodeCaseLink(link)
    expect(caseLinkQuery(`#case-series?${q}`)).toBe(q)
    expect(decodeCaseLink(q)).toEqual({ ...link, log10N: 5 })
  })
  it('accepts legacy mean,sd age links and drops malformed values', () => {
    expect(decodeCaseLink('age=35,6').ages).toEqual({ mode: 'mean', mean: '35' })
    const d = decodeCaseLink('t=xyz&k=abc&f=revel:0.5&lof=stop_gained,bogus&bg=nope&age=-5')
    expect(d.cons).toBeUndefined()
    expect(d.k).toBeUndefined()
    expect(d.missense).toBeUndefined()  // 0.5 is not a published cutoff
    expect(d.lof).toEqual(['stop_gained'])
    expect(d.background).toBeUndefined()
    expect(d.ages).toBeUndefined()
  })
})
