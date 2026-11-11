// Shareable links for the Case series tab. Inputs go in the URL fragment
// (#case-series?g=ARID1B&k=10…), which browsers never send to a server, so sharing a link
// uploads nothing. Every value is validated on the way back in.

import { BACKGROUNDS, LOF_OPTIONS } from './model'
import type { Background, Consequence, Sites } from './model'
import { cutoffAt, NO_FILTER } from './missense'
import type { MissenseFilter } from './missense'

export type CaseCons = 'mis' | 'lof' | 'both'

export interface CaseLink {
  genesText: string
  cons: CaseCons
  k: string
  log10N: number
  matches: string
  ages: { mode: 'decode' } | { mode: 'normal'; mean: string; sd: string }
  missense: MissenseFilter
  lof: Consequence[]
  sites: Sites
  background: Background
}

export function encodeCaseLink(l: CaseLink): string {
  const q = new URLSearchParams()
  q.set('g', l.genesText.split(/[\s,;]+/).filter(Boolean).join(','))
  q.set('t', l.cons)
  q.set('k', l.k)
  q.set('n', String(Math.round(10 ** l.log10N)))
  q.set('m', l.matches)
  q.set('age', l.ages.mode === 'decode' ? 'decode' : `${l.ages.mean},${l.ages.sd}`)
  q.set('f', l.missense.score === 'none' ? 'none' : `${l.missense.score}:${l.missense.threshold}`)
  q.set('lof', l.lof.join(','))
  q.set('s', l.sites)
  q.set('bg', l.background)
  return q.toString()
}

const num = (v: string | null | undefined) => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? v : null)

// the parts of a link that are valid; anything malformed is left out (and keeps its default)
export function decodeCaseLink(query: string): Partial<CaseLink> {
  const q = new URLSearchParams(query)
  const out: Partial<CaseLink> = {}
  const g = q.get('g')
  if (g) out.genesText = g.split(',').filter(Boolean).join(', ')
  const t = q.get('t')
  if (t === 'mis' || t === 'lof' || t === 'both') out.cons = t
  if (num(q.get('k'))) out.k = q.get('k')!
  const n = Number(q.get('n'))
  if (n >= 1) out.log10N = Math.min(8, Math.max(3, Math.log10(n)))
  if (num(q.get('m'))) out.matches = q.get('m')!
  const age = q.get('age')
  if (age === 'decode') out.ages = { mode: 'decode' }
  else if (age) {
    const [mean, sd] = age.split(',')
    if (num(mean) && num(sd)) out.ages = { mode: 'normal', mean, sd }
  }
  const f = q.get('f')
  if (f === 'none') out.missense = NO_FILTER
  else if (f) {
    const [score, t] = f.split(':')
    if ((score === 'am' || score === 'revel') && cutoffAt(score, Number(t))) out.missense = { score, threshold: Number(t) }
  }
  const lof = q.get('lof')
  if (lof !== null) {
    const list = lof.split(',').filter((c): c is Consequence => (LOF_OPTIONS as string[]).includes(c))
    out.lof = LOF_OPTIONS.filter(c => list.includes(c))
  }
  const s = q.get('s')
  if (s === 'hq' || s === 'all') out.sites = s
  const bg = q.get('bg')
  if (bg && bg in BACKGROUNDS) out.background = bg as Background
  return out
}

// the query part of a #case-series?… fragment, or null
export function caseLinkQuery(hash: string): string | null {
  const m = hash.match(/^#case-series\?(.*)$/)
  return m ? m[1] : null
}
