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
