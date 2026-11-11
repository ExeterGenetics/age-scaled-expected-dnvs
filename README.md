# Age-scaled expected *de novo* variants

Expected *de novo* SNVs (synonymous, missense, LoF) per gene for a cohort with a given paternal age
distribution, using Roulette per-site mutation rates calibrated to deCODE trios by paternal age group.
The app also subsets to gene sets (DDG2P monoallelic, PanelApp green, OMIM morbid, LOEUF < 0.6, or a
custom list) and runs an exact Poisson test of observed against expected counts.

**Use it:** https://exetergenetics.github.io/age-scaled-expected-dnvs/

The About tab in the app explains the method, options and caveats.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | React + Vite app. `npm run build` writes one self-contained `app/dist/index.html` with all data inlined, which also works opened straight from disk. |
| `gene_rates.tsv` | Roulette rate summed per gene (MANE Select) and consequence, for high-quality and all sites. Built by `build_gene_rates.py`. |
| `data/examples/kaplanis2020_dnvs.tsv` | Example de novos for the "Test your de novos" tab: Kaplanis et al. 2020 (45,221 DNMs, 31,058 individuals, CC BY) as gene, consequence, AlphaMissense, REVEL and count. Built by `build_example_dnvs.py`. |
| `missense_score_bins.tsv` | Missense Roulette rate per gene in AlphaMissense and REVEL score bins, edged at the published cutoffs (AM 0.34, > 0.564; REVEL PP3 0.644, 0.773, 0.932), plus unscored, for the missense score filter. Built by `build_missense_scores.py`. |
| `gene_sets/gene_sets.json` | Pre-built gene sets and an HGNC alias map. Built by `build_gene_sets.py`. |
| `data/scaling_factors_pat_only.tsv` | Calibration factor k per paternal age group, for the intergenic, synonymous and all-coding backgrounds. |

## Development

```sh
cd app
npm ci
npm run dev     # local server
npm test        # unit tests, including the Poisson test against R's poisson.test
npm run build   # app/dist/index.html
```

Pushing to `main` builds and deploys the site to GitHub Pages (`.github/workflows/pages.yml`).

## Rebuilding the data

```sh
# needs the Roulette MANE-annotated coding VCFs (not included)
python build_gene_rates.py <roulette_MANEannotated_coding_regions> gene_rates.tsv

# needs AlphaMissense_hg38.tsv.gz (zenodo.org/records/8208688) and REVEL v1.3
# (revel_with_transcript_ids, from sites.google.com/site/revelgenomics)
python build_missense_scores.py <roulette_MANEannotated_coding_regions> \
    AlphaMissense_hg38.tsv.gz revel_with_transcript_ids missense_score_bins.tsv

# font for the PDF report (DejaVu Sans subset, from matplotlib's mpl-data/fonts/ttf/)
python app/scripts/build_pdf_font.py DejaVuSans.ttf DejaVuSans-Bold.ttf DejaVuSans-Oblique.ttf DejaVuSans-BoldOblique.ttf

# example for the "Test your de novos" tab: Kaplanis et al. 2020 Supplementary Table 1
# (Europe PMC PMC7116826 supplementary files) saved as data/examples/raw/, plus the UCSC
# hg19ToHg38.over.chain.gz for lifting sites to AlphaMissense's GRCh38
python build_example_dnvs.py data/examples/raw/kaplanis2020_supp_table1.tsv \
    revel_with_transcript_ids AlphaMissense_hg38.tsv.gz hg19ToHg38.over.chain.gz \
    data/examples/kaplanis2020_dnvs.tsv

# needs gene_sets/raw/: hgnc_complete_set.txt, mim2gene_medgen,
# gnomad.v4.1.constraint_metrics.tsv (PanelApp is fetched and cached), plus a G2P DD csv
python build_gene_sets.py gene_rates.tsv <G2P_DD.csv> gene_sets
```

## References

Publication to follow. Other relevant publications:

1. Wright HIW, Beaumont RN, Fasham J, et al. The average individual genome: a survey of nearly 1 million
   whole-genome sequences. *Genome Med* 18, 160 (2026). https://doi.org/10.1186/s13073-026-01792-x
2. Seplyarskiy V, Koch EM, Lee DJ, et al. A mutation rate model at the basepair resolution identifies the
   mutagenic effect of polymerase III transcription. *Nat Genet* 55, 2235–2242 (2023).
   https://doi.org/10.1038/s41588-023-01562-0
3. Pálsson G, Hardarson MT, Jonsson H, et al. Complete human recombination maps. *Nature* 639, 700–707
   (2025). https://doi.org/10.1038/s41586-024-08450-5
