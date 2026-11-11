import { DATA_VERSIONS } from '../data/sources'
import { MME } from '../lib/caseseries'
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
  {
    id: 4,
    text: 'Cheng J, Novati G, Pan J, et al. Accurate proteome-wide missense variant effect prediction with AlphaMissense.',
    journal: 'Science 381, eadg7492 (2023).',
    doi: '10.1126/science.adg7492',
  },
  {
    id: 5,
    text: 'Ioannidis NM, Rothstein JH, Pejaver V, et al. REVEL: an ensemble method for predicting the pathogenicity of rare missense variants.',
    journal: 'Am J Hum Genet 99, 877–885 (2016).',
    doi: '10.1016/j.ajhg.2016.08.016',
  },
  {
    id: 6,
    text: 'Pejaver V, Byrne AB, Feng BJ, et al. Calibration of computational tools for missense variant pathogenicity classification and ClinGen recommendations for PP3/BP4 criteria.',
    journal: 'Am J Hum Genet 109, 2163–2177 (2022).',
    doi: '10.1016/j.ajhg.2022.10.013',
  },
  {
    id: 7,
    text: 'Kaplanis J, Samocha KE, Wiel L, et al. Evidence for 28 genetic disorders discovered by combining healthcare and research data.',
    journal: 'Nature 586, 757–762 (2020).',
    doi: '10.1038/s41586-020-2832-5',
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
        <dt>Missense score filter</dt>
        <dd>
          Restricts missense variants to sites with an AlphaMissense<Cite n={4} /> or REVEL<Cite n={5} /> score at or
          above a threshold: the published cutoffs (AlphaMissense likely benign &lt; 0.34 and likely pathogenic
          &gt; 0.564<Cite n={4} />; REVEL ClinGen PP3 supporting ≥ 0.644, moderate ≥ 0.773, strong ≥ 0.932<Cite n={6} />).
          Each possible missense SNV takes the highest score listed for that
          change (scores are given per transcript), and sites with no score are left out, so the expected count
          falls to the rate of passing sites. Use it with observed counts filtered the same way. LoF and synonymous
          counts are unchanged. REVEL positions are GRCh38 coordinates from the REVEL v1.3 file.
        </dd>
      </dl>
      <p>
        The Expected counts and Case series tabs share one set of these options; the Test your de novos tab has its own,
        with its own paternal ages.
      </p>

      <h3>Case series</h3>
      <p>
        How likely a case series of k patients with <i>de novo</i> variants in the same gene(s) is by chance, given the
        number of individuals sequenced that the cases could have come from (a guess; the chart shows how much it
        matters). It addresses chance recurrence only: it is not variant classification (such as ACMG PS2/PM6) or
        gene–disease validity scoring, and it does not use phenotypes.
      </p>
      <dl>
        <dt>Chance rate</dt>
        <dd>
          μ is the expected number of <i>de novo</i> variants of the chosen type per individual, summed over the genes:
          each gene's summed Roulette rate times the deCODE calibration averaged over a paternal age distribution. By
          default this is deCODE's own mix (Σ k<sub>bin</sub> / Σ probands<sub>bin</sub>), since published cases come
          from many cohorts; a mean and SD or a list of ages can be given instead. Background,
          sites, LoF classes and the missense filter are the Expected counts tab's. In N individuals the chance count is
          Poisson(Nμ); P(≥ k by chance) is its upper tail, and the individuals needed for probability q of reaching k
          is N<sub>q</sub> = qgamma(q, shape = k) / μ, because P(Poisson(λ) ≥ k) = P(Gamma(k, 1) ≤ λ).
        </dd>
        <dt>DDG2P baseline</dt>
        <dd>
          The median rate among DDG2P monoallelic genes, times the number of genes entered. This treats the case series
          as unselected; real series are ascertained on phenotype, which makes chance less likely when the phenotype is
          distinctive.
        </dd>
        <dt>Matchmaker Exchange</dt>
        <dd>
          The cases in Matchmaker Exchange nodes (the &quot;Patients/Cases in MME&quot; column of the network's statistics
          page, copied by hand: the MME API matches individual patients and has no statistics endpoint) are treated as
          a cohort of that many random individuals, at the chance rate above for missense (with the filter) or LoF,
          as matches are gene-level. Submitters choose people who already have a candidate variant, so chance matches
          can be more common than this and the probabilities are a lower bound. Cases include inherited and recessive
          candidates, favour known disease genes, and some patients are in more than one node, so treat it as a rough
          guide. A match is only evidence if the phenotype fits better than a random proband's would.
        </dd>
      </dl>

      <h3>Test your de novos</h3>
      <p>
        Tests a cohort's observed <i>de novo</i> SNVs against the expected counts for its paternal ages and model
        settings, in the manner of denovolyzeR. Set the paternal ages and number of individuals to match the cohort
        the variants came from.
      </p>
      <dl>
        <dt>Input formats</dt>
        <dd>
          A TSV or CSV file, plain or gzipped (bgzip included), or pasted text; tab, comma or space separated. The format
          is detected from the columns:
          <ul>
            <li>
              <b>One row per <i>de novo</i>:</b> gene and consequence, in any order with a header (gene/symbol,
              consequence/class) or gene then consequence without one; the header line may start with #. An optional
              count column (<code>n</code>, count, carriers) counts a row more than once, for recurrent variants. A
              column named after the active score (am_pathogenicity or AlphaMissense; REVEL) applies the missense filter;
              without one, all missense variants count.
            </li>
            <li>
              <b>Counts per gene:</b> <code>gene N_syn N_mis N_lof</code>, with or without a header (any of the
              syn/mis/lof columns). Counts are taken as given, so they should use the same LoF classes and missense
              filter as the model.
            </li>
          </ul>
          Consequences can be VEP or bcftools terms (missense_variant, stop_gained&amp;splice_region_variant; the most
          severe term counts) or denovolyzeR classes (syn, mis, non, splice). Annotate with the MANE Select transcript
          to match the rates. Indels are skipped, as the rate model covers SNVs only, and genes outside the rate
          table (autosomal protein-coding genes) are skipped. Gene symbols are matched directly or through unambiguous
          previous and alias HGNC symbols. VCFs are not taken: they hold one record per site, not per <i>de novo</i>.
        </dd>
        <dt>Synonymous check</dt>
        <dd>
          Synonymous <i>de novos</i> are close to neutral, so their observed/expected ratio (two-sided exact Poisson)
          measures how well the expectations fit the cohort: detection, cohort size and ages. Below 1 understates
          missense and LoF enrichment, above 1 overstates it. The rescale option multiplies all expectations by the
          synonymous O/E, at the cost of using the synonymous count as calibration.
        </dd>
        <dt>Burden</dt>
        <dd>
          Observed against expected across all genes for synonymous, missense, LoF and protein-altering (missense +
          LoF) variants: exact Poisson tests, one-sided for enrichment except synonymous, with exact 95% CIs on O/E.
        </dd>
        <dt>Gene set</dt>
        <dd>
          Splits the burden into genes inside and outside a set, and tests whether the set is more enriched than the
          rest: given the <i>de novos</i> in both, the number in the set is binomial with its share of the expectation
          (one-sided exact test). Any cohort-wide misfit in the expectations cancels in this comparison. The per-gene
          table is then restricted to the set.
        </dd>
        <dt>Per gene</dt>
        <dd>
          Genes with a missense or LoF <i>de novo</i>, tested one-sided (exact Poisson) for LoF, missense and
          protein-altering variants and sorted by the smaller of the LoF and protein-altering p. As in denovolyzeR,
          those two tests set the Bonferroni threshold: 0.05 / (genes × 2), over all genes, or over the set's genes when
          one is chosen (the count passing the all-gene threshold is also given). A dash marks observed variants where
          no sites pass the filters.
        </dd>
        <dt>Example data</dt>
        <dd>
          Kaplanis et al. 2020<Cite n={7} />, Supplementary Table 1: 45,221 coding and splicing <i>de novo</i> mutations
          in 31,058 individuals with developmental disorders (DDD, GeneDx, RadboudUMC), with AlphaMissense and REVEL
          scores added for missense SNVs. Paternal ages are not published, so the default age distribution is used.
          Diagnostic cohorts are enriched for disorder genes, so strong burden is expected.
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

      <h3>Data versions</h3>
      <table className="versions"><tbody>
        {[...DATA_VERSIONS, ['Matchmaker Exchange counts', `${MME.date} statistics page`] as [string, string]].map(([k, v]) => (
          <tr key={k}><th>{k}</th><td>{v}</td></tr>
        ))}
      </tbody></table>

      <h3>Your data</h3>
      <p>
        Everything runs in your browser. Ages, gene lists and <i>de novo</i> variants you enter or load are never sent
        anywhere, and the page makes no network requests with them. The page is a single file, so it can be saved and
        opened offline.
      </p>

      <h3>Contact</h3>
      <p>
        V. Kartik Chundru, v.chundru AT exeter.ac.uk<br />
        Caroline Wright, caroline.wright AT exeter.ac.uk<br />
        <a href="https://paradigmgenomics.org/" target="_blank" rel="noreferrer">https://paradigmgenomics.org/</a>
      </p>

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
