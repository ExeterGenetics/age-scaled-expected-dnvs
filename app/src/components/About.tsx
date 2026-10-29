const REFS = [
  {
    id: 1,
    text: 'Wright HIW, Beaumont RN, Fasham J, et al. The average individual genome: a survey of nearly 1 million whole-genome sequences.',
    journal: 'Genome Med 18, 160 (2026).',
    doi: '10.1186/s13073-026-01792-x',
  },
  {
    id: 2,
    text: 'Seplyarskiy V, Koch EM, Lee DJ, Lichtman JS, Luan HH, Sunyaev SR. A mutation rate model at the basepair resolution identifies the mutagenic effect of polymerase III transcription.',
    journal: 'Nat Genet 55, 2235–2242 (2023).',
    doi: '10.1038/s41588-023-01562-0',
  },
  {
    id: 3,
    text: 'Pálsson G, Hardarson MT, Jonsson H, et al. Complete human recombination maps.',
    journal: 'Nature 639, 700–707 (2025).',
    doi: '10.1038/s41586-024-08450-5',
  },
]

// Scrolls rather than following a #link, which sandboxed previews can block
const Cite = ({ n }: { n: number }) => (
  <sup>
    <button
      type="button" className="linklike cite"
      onClick={() => document.getElementById(`ref-${n}`)?.scrollIntoView({ behavior: 'smooth' })}
    >[{n}]</button>
  </sup>
)

export function About() {
  return (
    <article className="about panel">
      <h2>About</h2>

      <blockquote className="lead-quote">
        &ldquo;The average human genome has a mean of 61 constitutive <i>de novo</i> SNVs/indels &hellip; [which] increases by
        1.17 (95% CI 1.07–1.27) per year of paternal age at birth and 0.38 (95% CI 0.27–0.50) per year of maternal age
        at birth.&rdquo;
        <footer>Wright et al., 2026<Cite n={1} /></footer>
      </blockquote>

      <h3>What this tool does</h3>
      <p>
        Gives the number of <i>de novo</i> SNVs expected by chance in each protein-coding gene (synonymous, missense and
        LoF), for a cohort with a given distribution of paternal ages. Comparing these with the <i>de novo</i> variants
        observed in a cohort tests whether a gene, or a set of genes, carries more than chance would explain; the
        optional Poisson test under the expected counts does this for the gene set selected.
      </p>

      <h3>How the expected counts are made</h3>
      <ol>
        <li>
          <b>Per-site mutation rates from Roulette.</b><Cite n={2} /> Every possible SNV in a gene's MANE Select
          transcript has a Roulette rate. These are summed per gene within each consequence class, counting each site
          once under its most severe consequence.
        </li>
        <li>
          <b>Calibration to <i>de novo</i> variants seen in deCODE trios.</b><Cite n={3} /> Roulette rates are relative. To
          turn them into expected counts per proband, the <i>de novo</i> variants observed in deCODE trios are counted at a set
          of reference sites (the calibration background) and divided by the summed Roulette rate of those sites.
          This is done separately for each paternal age group.
        </li>
        <li>
          <b>Your cohort's paternal ages.</b> Ages are grouped as &lt;25, 25–29, 30–34, 35–39 and ≥40. A gene's
          expected count is its summed rate multiplied, for each age group, by the number of your probands in that
          group and that group's calibration factor per deCODE proband. With a mean and SD, the numbers per group come
          from a normal distribution, with the tails counted in the end groups.
        </li>
      </ol>

      <h3>What Roulette is</h3>
      <p>
        Roulette<Cite n={2} /> is a basepair-resolution model of the germline mutation rate. It is trained on very
        rare variants in large population genome datasets, which are close to recent <i>de novo</i> events and little
        affected by selection, and it predicts the rate of each possible SNV from its surrounding sequence context
        (five bases) together with regional features of the genome. It predicts where <i>de novo</i> variants occur more
        accurately than the earlier trinucleotide-context models used in most <i>de novo</i> enrichment tools.
      </p>
      <p>
        Roulette flags sites where its estimates are less reliable: regions that are hard to sequence (low
        mappability, long simple repeats, poor sequencing metrics) and a few repetitive sequence contexts where the
        model fits population data poorly. These are what the &quot;High-quality sites only&quot; option leaves out.
      </p>

      <h3>Options in the Model panel</h3>
      <dl>
        <dt>Calibration background</dt>
        <dd>
          The reference sites used to calibrate against deCODE. <b>Intergenic</b> (default) uses sites between genes:
          the largest set, so the most precise calibration. <b>Synonymous</b> uses synonymous sites only: the same
          kind of sequence as the genes being scored, but far fewer sites. <b>All coding</b> uses every coding site.
          The three agree to within about 15% overall.
        </dd>
        <dt>Sites included per gene</dt>
        <dd>
          <b>High-quality sites only</b> (default) leaves out the flagged sites above. The calibration was done on
          high-quality sites, so this is the like-for-like choice, and it suits data where those regions are filtered
          or poorly called. <b>All sites</b> includes them; expected counts are slightly higher, but those rates were
          not calibrated.
        </dd>
        <dt>LoF</dt>
        <dd>
          Stop gained, splice donor and splice acceptor by default. Start lost and stop lost can be added.
        </dd>
      </dl>

      <h3>Caveats</h3>
      <ul>
        <li>
          <b>The absolute numbers depend on detection.</b> Expected counts are calibrated to <i>de novo</i> variants as called
          in deCODE whole-genome trios. If your calling is more or less sensitive (exome versus genome, coverage,
          filters), every expected count is off by roughly the same factor. Check observed against expected for
          synonymous variants in your own data: an observed/expected well away from 1 points to a calibration
          difference rather than biology, and enrichment for missense or LoF should be read relative to it.
        </li>
        <li>
          <b>The Poisson test treats the expected count as exact.</b> It does not include uncertainty in the
          calibration. For large gene sets, where expected counts run into the hundreds, a few percent of calibration
          error is enough to give a small p-value, so compare with synonymous before reading much into it.
        </li>
        <li>
          <b>Only the overall rate is scaled by age.</b> Each age group gets its own calibration factor, but the
          relative rates between sites are Roulette&apos;s at every age; any change in the pattern of <i>de novo</i> variants
          with age is not modelled. Maternal age is not modelled separately, though it is partly absorbed because
          maternal and paternal ages are correlated in the deCODE trios.
        </li>
        <li>
          <b>Scope.</b> SNVs on chromosomes 1–22 in MANE Select transcripts only: no indels, no X or Y, no other
          transcripts, and no multi-nucleotide variants.
        </li>
        <li>
          <b>A few genes have no rates</b> in the source files and are left out (for example <i>SHANK3</i> and <i>POLR2A</i>); the
          gene set panel lists any that fall in the selected set.
        </li>
        <li>
          The number of deCODE probands per age group (under Model) converts each calibration factor to a rate per
          proband; it can be edited if better figures are available.
        </li>
      </ul>

      <h3>References</h3>
      <p>Publication to follow. Other relevant publications:</p>
      <ol className="refs">
        {REFS.map(r => (
          <li key={r.id} id={`ref-${r.id}`}>
            {r.text} <i>{r.journal}</i>{' '}
            <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">https://doi.org/{r.doi}</a>
          </li>
        ))}
      </ol>
    </article>
  )
}
