"""Bin each gene's missense roulette rate by AlphaMissense and REVEL score.

Missense sites are taken from the MANE-annotated coding VCFs exactly as in
build_gene_rates.py (a site counts for a gene when missense is its most severe
consequence there). Each site gets the maximum score over the score file's rows
for that chrom/pos/ref/alt (several transcripts can score the same change).
Scores are binned in 0.05 steps, bin j holding scores in [j/20, (j+1)/20), the
last bin closed at 1, so the rate with score >= j/20 is the sum of bins j..19.
Sites with no score go to a separate "unscored" column and never pass a
threshold.

Output: one row per gene and score, with 20 binned sums and the unscored sum for
high-quality sites (hq_*) and for all sites (all_*), as integers in units of
0.001 roulette MR (the VCF precision). Each row's 21 hq_* (or all_*) values sum
to that gene's hq_missense (or all_missense) in gene_rates.tsv, up to rounding.

Usage:
  python build_missense_scores.py ../roulette_MANEannotated_coding_regions \
      AlphaMissense_hg38.tsv.gz revel_with_transcript_ids missense_score_bins.tsv
"""
import gzip
import os
import sys
from multiprocessing import Pool

import polars as pl

from build_gene_rates import HQ_FILTERS, RANK

MISSENSE = RANK["missense"]
NBINS = 20
KEY = ["chrom", "pos", "ref", "alt"]


def missense_sites(path):
    rows = []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if line[0] == "#" or "missense" not in line:
                continue
            f = line.rstrip("\n").split("\t")
            mr = bcsq = None
            for kv in f[7].split(";"):
                if kv.startswith("MR="):
                    mr = float(kv[3:])
                elif kv.startswith("BCSQ="):
                    bcsq = kv[5:]
            if mr is None or not bcsq:
                continue
            best = {}
            for entry in bcsq.split(","):
                parts = entry.split("|")
                if len(parts) < 2 or entry[0] == "@":
                    continue
                gene = parts[1]
                for csq in parts[0].lstrip("*").split("&"):
                    r = RANK.get(csq)
                    if r is not None and r < best.get(gene, 99):
                        best[gene] = r
            hq = f[6] in HQ_FILTERS
            for gene, r in best.items():
                if r == MISSENSE:
                    rows.append((f[0], int(f[1]), f[3], f[4], gene, round(mr * 1000), hq))
    return rows


def load_sites(vcf_dir):
    paths = [os.path.join(vcf_dir, "%d_annot.vcf.gz" % c) for c in range(1, 23)]
    with Pool(min(8, os.cpu_count() or 1)) as pool:
        chunks = pool.map(missense_sites, paths)
    schema = {"chrom": pl.Utf8, "pos": pl.Int64, "ref": pl.Utf8, "alt": pl.Utf8,
              "gene": pl.Utf8, "mr_milli": pl.Int64, "hq": pl.Boolean}
    return pl.concat([pl.DataFrame(c, schema=schema, orient="row") for c in chunks])


def load_alphamissense(path, keys):
    # 3 licence lines, then a '#CHROM' header; chromosomes are 'chr1'..
    am = pl.scan_csv(path, separator="\t", skip_rows=3, has_header=True,
                     schema_overrides={"#CHROM": pl.Utf8, "POS": pl.Int64})
    return (am.select(pl.col("#CHROM").str.replace("^chr", "").alias("chrom"),
                      pl.col("POS").alias("pos"), pl.col("REF").alias("ref"),
                      pl.col("ALT").alias("alt"), pl.col("am_pathogenicity").alias("score"))
              .join(keys, on=KEY, how="semi")
              .group_by(KEY).agg(pl.col("score").max())
              .collect())


def load_revel(path, keys):
    # chr,hg19_pos,grch38_pos,ref,alt,aaref,aaalt,REVEL,Ensembl_transcriptid;
    # grch38_pos is '.' where the hg19 site does not lift over
    rv = pl.scan_csv(path, schema_overrides={"chr": pl.Utf8, "grch38_pos": pl.Utf8,
                                             "hg19_pos": pl.Utf8})
    return (rv.filter(pl.col("grch38_pos") != ".")
              .select(pl.col("chr").alias("chrom"),
                      pl.col("grch38_pos").cast(pl.Int64).alias("pos"),
                      "ref", "alt", pl.col("REVEL").cast(pl.Float64).alias("score"))
              .join(keys, on=KEY, how="semi")
              .group_by(KEY).agg(pl.col("score").max())
              .collect())


def bin_by_gene(sites, scores, name):
    j = sites.join(scores, on=["chrom", "pos", "ref", "alt"], how="left")
    scored = j["score"].is_not_null().sum()
    print("%s: %d of %d missense site-gene pairs scored" % (name, scored, len(j)))
    j = j.with_columns(
        pl.when(pl.col("score").is_null()).then(pl.lit("u"))
          .otherwise((pl.col("score") * NBINS + 1e-9).floor().clip(0, NBINS - 1)
                     .cast(pl.Int64).cast(pl.Utf8))
          .alias("bin"))
    cols = [str(i) for i in range(NBINS)] + ["u"]
    out = []
    for prefix, frame in (("hq", j.filter(pl.col("hq"))), ("all", j)):
        w = (frame.group_by(["gene", "bin"]).agg(pl.col("mr_milli").sum())
                  .pivot(on="bin", index="gene", values="mr_milli"))
        for c in cols:
            if c not in w.columns:
                w = w.with_columns(pl.lit(0, dtype=pl.Int64).alias(c))
        out.append(w.select(["gene"] + [pl.col(c).fill_null(0).alias("%s_%s" % (prefix, c))
                                        for c in cols]))
    res = out[1].join(out[0], on="gene", how="left").fill_null(0)
    return res.with_columns(pl.lit(name).alias("score")).select(
        ["gene", "score"] + ["hq_%s" % c for c in cols] + ["all_%s" % c for c in cols])


def main(vcf_dir, am_path, revel_path, out_path):
    sites = load_sites(vcf_dir)
    print("%d missense site-gene pairs from the VCFs" % len(sites))
    # only score rows at VCF missense sites are kept, to bound memory
    keys = sites.select(KEY).unique().lazy()
    tables = [bin_by_gene(sites, load_alphamissense(am_path, keys), "am"),
              bin_by_gene(sites, load_revel(revel_path, keys), "revel")]
    pl.concat(tables).sort(["gene", "score"]).write_csv(out_path, separator="\t")
    print("wrote %s" % out_path)


if __name__ == "__main__":
    main(*sys.argv[1:5])
