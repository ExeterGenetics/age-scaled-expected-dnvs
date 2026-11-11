"""Build the example de novo table for the app's "Test your de novos" tab.

Source: Kaplanis et al. 2020, Nature 586:757-762 (open access, PMC7116826),
Supplementary Table 1: 45,221 coding and splicing de novo mutations in 31,058
individuals with developmental disorders (DDD, GeneDx, RadboudUMC), annotated by
VEP, GRCh37 positions.

Missense SNVs get the maximum AlphaMissense and REVEL score over the score
files' rows for that change, as in build_missense_scores.py. REVEL is joined on
its hg19 position; AlphaMissense (GRCh38 only) after lifting each site over
with the UCSC hg19ToHg38 chain. Identical rows are collapsed with a count n.

Output columns: gene, consequence, am_pathogenicity, REVEL, n (scores blank
where missing or not missense).

Usage:
  python build_example_dnvs.py data/examples/raw/kaplanis2020_supp_table1.tsv \
      ../missense_scores/raw/revel_with_transcript_ids \
      ../missense_scores/raw/AlphaMissense_hg38.tsv.gz \
      ../missense_scores/raw/hg19ToHg38.over.chain.gz \
      data/examples/kaplanis2020_dnvs.tsv
"""
import sys

import polars as pl
from pyliftover import LiftOver

KEY = ["chrom", "pos", "ref", "alt"]


def main(supp, revel_path, am_path, chain, out):
    d = (pl.read_csv(supp, separator="\t", infer_schema_length=0)  # all text; only pos is numeric
           .with_columns(pl.col("pos").cast(pl.Int64)))
    mis = d.filter((pl.col("consequence") == "missense_variant")
                   & (pl.col("ref").str.len_chars() == 1) & (pl.col("alt").str.len_chars() == 1))
    keys19 = mis.select(KEY).unique()

    revel = (pl.scan_csv(revel_path, schema_overrides={"chr": pl.Utf8, "hg19_pos": pl.Utf8, "grch38_pos": pl.Utf8})
               .filter(pl.col("hg19_pos") != ".")
               .select(pl.col("chr").alias("chrom"), pl.col("hg19_pos").cast(pl.Int64).alias("pos"),
                       "ref", "alt", pl.col("REVEL").cast(pl.Float64))
               .join(keys19.lazy(), on=KEY, how="semi")
               .group_by(KEY).agg(pl.col("REVEL").max())
               .collect())

    lo = LiftOver(chain)
    pos38 = []
    for c, p in keys19.select("chrom", "pos").iter_rows():
        hits = lo.convert_coordinate("chr" + c, p - 1)
        pos38.append(hits[0][1] + 1 if hits and hits[0][0] == "chr" + c else None)
    keys = keys19.with_columns(pl.Series("pos38", pos38, dtype=pl.Int64))
    print("%d missense SNV sites; %d lifted to GRCh38" % (len(keys), keys["pos38"].is_not_null().sum()))

    k38 = keys.drop_nulls("pos38").select("chrom", pl.col("pos38").alias("pos"), "ref", "alt")
    am = (pl.scan_csv(am_path, separator="\t", skip_rows=3, has_header=True,
                      schema_overrides={"#CHROM": pl.Utf8, "POS": pl.Int64})
            .select(pl.col("#CHROM").str.replace("^chr", "").alias("chrom"), pl.col("POS").alias("pos"),
                    pl.col("REF").alias("ref"), pl.col("ALT").alias("alt"), "am_pathogenicity")
            .join(k38.lazy(), on=KEY, how="semi")
            .group_by(KEY).agg(pl.col("am_pathogenicity").max())
            .collect()
            .rename({"pos": "pos38"}))

    scores = (keys.join(am, on=["chrom", "pos38", "ref", "alt"], how="left")
                  .join(revel, on=KEY, how="left").drop("pos38"))
    print("AlphaMissense for %d, REVEL for %d of %d missense sites"
          % (scores["am_pathogenicity"].is_not_null().sum(), scores["REVEL"].is_not_null().sum(), len(scores)))

    def fmt(col, dp):
        return pl.col(col).round(dp).cast(pl.Utf8).alias(col)

    res = (d.join(scores, on=KEY, how="left")
            .with_columns(fmt("am_pathogenicity", 4), fmt("REVEL", 3))
            .group_by(pl.col("symbol").alias("gene"), "consequence", "am_pathogenicity", "REVEL")
            .agg(pl.len().alias("n"))
            .sort(["gene", "consequence", "am_pathogenicity", "REVEL"], nulls_last=True))
    res.write_csv(out, separator="\t", null_value="")
    print("%d de novos in %d rows; wrote %s" % (res["n"].sum(), len(res), out))


if __name__ == "__main__":
    main(*sys.argv[1:6])
